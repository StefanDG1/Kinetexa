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
export const tables = [
  "activities",
  "sources",
  "metricHistory",
  "gear",
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
  args: { athleteId: v.id("athletes"), jobId: v.id("lifecycleJobs") },
  handler: async (ctx, { athleteId, jobId }) => {
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
        .take(100);
      const eligible = rows.filter((r) => r._id !== jobId);
      if (eligible.length) {
        for (const row of eligible) await ctx.db.delete(row._id);
        return false;
      }
    }
    await ctx.db.delete(jobId);
    await ctx.db.delete(athleteId);
    return true;
  },
});
