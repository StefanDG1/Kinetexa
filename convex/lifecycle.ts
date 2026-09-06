import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import { recordOperation } from "./operationModel";
export const tables = [
  "productEvents",
  "activities",
  "operationalEvents",
  "activityFacts",
  "sources",
  "metricHistory",
  "gear",
  "gearReminders",
  "gearServices",
  "goals",
  "plans",
  "analyses",
  "privacyZones",
  "shares",
  "health",
  "billing",
  "usage",
  "messages",
  "auditEvents",
  "lifecycleJobs",
  "outbox",
  "aiRuns",
  "insights",
  "emailEvents",
  "exportParts",
] as const;
export const requestExport = mutation({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "export", 2, 86400000);
    const id = await ctx.db.insert("lifecycleJobs", {
      athleteId: a._id,
      kind: "export",
      status: "queued",
      createdAt: Date.now(),
      expiresAt: Date.now() + 7 * 86400000,
    });
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "export_requested",
      at: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.exportActions.run, {
      id,
    });
    return id;
  },
});
export const requestDeletion = mutation({
  args: { confirmation: v.string() },
  handler: async (ctx, { confirmation }) => {
    const a = await requireAthlete(ctx);
    if (confirmation !== "DELETE MY ACCOUNT")
      throw new ConvexError("Type DELETE MY ACCOUNT to confirm.");
    await ctx.db.patch(a._id, {
      status: "deleting",
      aiConsent: false,
      analyticsConsent: false,
    });
    const id = await ctx.db.insert("lifecycleJobs", {
      athleteId: a._id,
      kind: "deletion",
      status: "queued",
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "deletion_requested",
      at: Date.now(),
    });
    // Allow already-running actions to finish before removing the entire private object prefix.
    await ctx.scheduler.runAfter(
      15 * 60000,
      internal.lifecycleActions.deleteData,
      { id },
    );
    return id;
  },
});
export const owned = query({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      job = await ctx.db.get(id);
    if (!job || job.athleteId !== a._id)
      throw new ConvexError("Job unavailable.");
    return job;
  },
});
export const context = internalQuery({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) return null;
    const athlete = await ctx.db.get(job.athleteId);
    if (!athlete) return null;
    return { job, athlete };
  },
});
export const page = internalQuery({
  args: {
    athleteId: v.id("athletes"),
    table: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    if (!tables.includes(args.table as any))
      throw new Error("Invalid export table");
    return ctx.db
      .query(args.table as (typeof tables)[number])
      .withIndex("by_athlete", (q) => q.eq("athleteId", args.athleteId))
      .paginate({ cursor: args.cursor, numItems: 50 });
  },
});
export const status = internalMutation({
  args: {
    id: v.id("lifecycleJobs"),
    status: v.string(),
    key: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...data }) => {
    if (await ctx.db.get(id)) await ctx.db.patch(id, data);
  },
});
export const purgeBatch = internalMutation({
  args: {
    athleteId: v.id("athletes"),
    jobId: v.id("lifecycleJobs"),
    lease: v.number(),
  },
  handler: async (ctx, { athleteId, jobId, lease }) => {
    const job = await ctx.db.get(jobId),
      athlete = await ctx.db.get(athleteId);
    if (
      !job ||
      job.kind !== "deletion" ||
      job.athleteId !== athleteId ||
      athlete?.status !== "deleting" ||
      job.status !== "running" ||
      job.lease !== lease
    )
      throw new ConvexError("Deletion attempt unavailable.");
    if (athlete.telemetryTransmitted && !athlete.telemetryDeletionVerified)
      throw new ConvexError(
        "Analytics erasure must be verified before final deletion.",
      );
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
        .take(100);
      const eligible = rows.filter(
        (r) => r._id !== jobId && r._id !== job.notificationId,
      );
      if (eligible.length) {
        for (const row of eligible) await ctx.db.delete(row._id);
        return false;
      }
    }
    if (job.notificationId && (await ctx.db.get(job.notificationId))) {
      await ctx.db.patch(job.notificationId, {
        status: athlete.emailSuppressed ? "suppressed" : "queued",
        ...(athlete.emailSuppressed ? { payload: undefined } : {}),
      });
      if (!athlete.emailSuppressed)
        await ctx.scheduler.runAfter(0, internal.emailActions.send, {
          id: job.notificationId,
        });
    }
    await ctx.db.delete(jobId);
    await ctx.db.delete(athleteId);
    await recordOperation(ctx, {
      kind: "deletion",
      jobId,
      startedAt: job.createdAt,
      attempt: lease,
      outcome: "complete",
    });
    return true;
  },
});
export const claimDeletion = internalMutation({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id),
      athlete = job ? await ctx.db.get(job.athleteId) : null;
    if (
      !job ||
      job.kind !== "deletion" ||
      athlete?.status !== "deleting" ||
      !["queued", "retrying"].includes(job.status)
    )
      return null;
    if (Date.now() < job.createdAt + 15 * 60000) return null;
    const lease = (job.lease ?? 0) + 1,
      attempts = (job.attempts ?? 0) + 1;
    const notificationId =
      job.notificationId && (await ctx.db.get(job.notificationId))
        ? job.notificationId
        : undefined;
    await ctx.db.patch(id, {
      status: "running",
      lease,
      attempts,
      notificationId,
      error: undefined,
    });
    await ctx.scheduler.runAfter(
      11 * 60000,
      internal.lifecycle.deletionFailed,
      { id, lease },
    );
    return { job: { ...job, lease, attempts, notificationId }, athlete };
  },
});
export const waitForAnalytics = internalMutation({
  args: { id: v.id("lifecycleJobs"), lease: v.number() },
  handler: async (ctx, { id, lease }) => {
    const job = await ctx.db.get(id);
    if (
      !job ||
      job.kind !== "deletion" ||
      job.status !== "running" ||
      job.lease !== lease
    )
      return;
    await ctx.db.patch(id, {
      status: "retrying",
      attempts: Math.max(0, (job.attempts ?? 1) - 1),
      error: "Waiting for analytics event erasure to complete.",
    });
    await ctx.scheduler.runAfter(
      30 * 60000,
      internal.lifecycleActions.deleteData,
      { id },
    );
  },
});
export const prepareNotification = internalMutation({
  args: {
    id: v.id("lifecycleJobs"),
    lease: v.number(),
    payload: v.object({
      from: v.string(),
      to: v.string(),
      subject: v.string(),
      text: v.string(),
    }),
  },
  handler: async (ctx, { id, lease, payload }) => {
    const job = await ctx.db.get(id),
      athlete = job ? await ctx.db.get(job.athleteId) : null;
    if (
      !job ||
      job.kind !== "deletion" ||
      job.lease !== lease ||
      job.status !== "running" ||
      athlete?.status !== "deleting"
    )
      throw new ConvexError("Deletion attempt unavailable.");
    if (job.notificationId || athlete.emailSuppressed) return;
    const notificationId = await ctx.db.insert("outbox", {
      athleteId: job.athleteId,
      template: "deletion",
      dedupeKey: `deletion-${id}`,
      status: "waiting-deletion",
      attempts: 0,
      payload,
      createdAt: Date.now(),
    });
    await ctx.db.patch(id, { notificationId });
  },
});
export const deletionFailed = internalMutation({
  args: { id: v.id("lifecycleJobs"), lease: v.number() },
  handler: async (ctx, { id, lease }) => {
    const job = await ctx.db.get(id);
    if (
      !job ||
      job.kind !== "deletion" ||
      job.status !== "running" ||
      job.lease !== lease
    )
      return;
    const retry = (job.attempts ?? 0) < 4;
    await recordOperation(ctx, {
      kind: "deletion",
      jobId: id,
      athleteId: job.athleteId,
      startedAt: job.createdAt,
      attempt: lease,
      outcome: retry ? "retrying" : "failed",
    });
    await ctx.db.patch(id, {
      status: retry ? "retrying" : "failed",
      error: retry
        ? undefined
        : "Deletion needs operator attention. The account remains locked.",
    });
    if (retry)
      await ctx.scheduler.runAfter(
        30000 * 2 ** (job.attempts ?? 1) + Math.floor(Math.random() * 10000),
        internal.lifecycleActions.deleteData,
        { id },
      );
  },
});
export const retryDeletion = internalMutation({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job || job.kind !== "deletion" || job.status !== "failed")
      throw new ConvexError("Deletion is not awaiting recovery.");
    await ctx.db.patch(id, {
      status: "retrying",
      attempts: 0,
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.lifecycleActions.deleteData, {
      id,
    });
  },
});
