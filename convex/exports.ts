import { v, ConvexError } from "convex/values";
import {
  mutation,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import { tables } from "./lifecycle";
import { visibleHealth } from "./health";
import type { Doc } from "./_generated/dataModel";
import { exportPosition, EXPORT_RETENTION_MS } from "./exportModel";
export const exportTables = tables.filter(
  (t) => !["lifecycleJobs", "exportParts", "activityFacts"].includes(t),
);
export const retry = mutation({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      job = await ctx.db.get(id);
    if (!job || job.athleteId !== a._id || job.kind !== "export")
      throw new ConvexError("Export unavailable.");
    if ((job.expiresAt ?? job.createdAt + EXPORT_RETENTION_MS) <= Date.now())
      throw new ConvexError("Export expired. Request a new export.");
    if (job.status !== "failed")
      throw new ConvexError("This export is not awaiting a retry.");
    await rateLimit(ctx, a._id, "export-retry", 4, 86400000);
    await ctx.db.patch(id, {
      status: "retrying",
      attempts: 0,
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.exportActions.run, { id });
  },
});
export const claim = internalMutation({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id),
      a = job ? await ctx.db.get(job.athleteId) : null;
    if (
      !job ||
      job.kind !== "export" ||
      !a ||
      a.status !== "active" ||
      !["queued", "retrying"].includes(job.status)
    )
      return null;
    if ((job.expiresAt ?? job.createdAt + EXPORT_RETENTION_MS) <= Date.now())
      return null;
    const lease = (job.lease ?? 0) + 1,
      attempts = (job.attempts ?? 0) + 1;
    await ctx.db.patch(id, {
      status: "running",
      lease,
      attempts,
      error: undefined,
    });
    await ctx.scheduler.runAfter(11 * 60000, internal.exports.fail, {
      id,
      lease,
    });
    return { job: { ...job, lease, attempts }, athlete: a };
  },
});
export const page = internalQuery({
  args: {
    id: v.id("lifecycleJobs"),
    lease: v.number(),
    table: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id),
      a = job ? await ctx.db.get(job.athleteId) : null;
    if (
      !job ||
      job.status !== "running" ||
      job.lease !== args.lease ||
      a?.status !== "active"
    )
      throw new ConvexError("Export attempt expired.");
    const table = exportTables[args.table];
    if (!table) throw new ConvexError("Invalid export position.");
    const page = await ctx.db
      .query(table)
      .withIndex("by_athlete", (q) => q.eq("athleteId", job.athleteId))
      .paginate({ cursor: args.cursor, numItems: 5 });
    return {
      ...page,
      page:
        table === "health"
          ? await visibleHealth(ctx, page.page as Doc<"health">[])
          : page.page,
    };
  },
});
export const checkpoint = internalMutation({
  args: {
    id: v.id("lifecycleJobs"),
    lease: v.number(),
    key: v.string(),
    bytes: v.number(),
    sha256: v.string(),
    position: exportPosition,
    done: v.boolean(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id),
      a = job ? await ctx.db.get(job.athleteId) : null;
    if (
      !job ||
      job.status !== "running" ||
      job.lease !== args.lease ||
      a?.status !== "active"
    )
      return false;
    const partCount = job.partCount ?? 0;
    await ctx.db.insert("exportParts", {
      athleteId: job.athleteId,
      jobId: job._id,
      index: partCount,
      key: args.key,
      bytes: args.bytes,
      sha256: args.sha256,
      createdAt: Date.now(),
    });
    await ctx.db.patch(job._id, {
      status: args.done ? "finalizing" : "queued",
      position: args.position,
      partCount: partCount + 1,
      attempts: 0,
    });
    await ctx.scheduler.runAfter(
      0,
      args.done ? internal.exportActions.finalize : internal.exportActions.run,
      { id: job._id },
    );
    if (args.done)
      await ctx.scheduler.runAfter(
        11 * 60000,
        internal.exports.resumeFinalization,
        { id: job._id },
      );
    return true;
  },
});
export const fail = internalMutation({
  args: { id: v.id("lifecycleJobs"), lease: v.number() },
  handler: async (ctx, { id, lease }) => {
    const job = await ctx.db.get(id);
    if (!job || job.status !== "running" || job.lease !== lease) return;
    const retry = (job.attempts ?? 0) < 4;
    await ctx.db.patch(id, {
      status: retry ? "retrying" : "failed",
      error: retry
        ? undefined
        : "Export stopped. Retry to resume from the last completed part.",
    });
    if (retry)
      await ctx.scheduler.runAfter(
        1000 * 2 ** (job.attempts ?? 1) + Math.floor(Math.random() * 1000),
        internal.exportActions.run,
        { id },
      );
  },
});
export const parts = internalQuery({
  args: { id: v.id("lifecycleJobs"), cursor: v.union(v.string(), v.null()) },
  handler: (ctx, { id, cursor }) =>
    ctx.db
      .query("exportParts")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .paginate({ cursor, numItems: 100 }),
});
export const list = query({
  args: { id: v.id("lifecycleJobs"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, cursor }) => {
    const a = await requireAthlete(ctx),
      job = await ctx.db.get(id);
    if (!job || job.athleteId !== a._id || job.kind !== "export")
      throw new ConvexError("Export unavailable.");
    return ctx.db
      .query("exportParts")
      .withIndex("by_job", (q) => q.eq("jobId", id))
      .paginate({ cursor, numItems: 100 });
  },
});
export const part = internalQuery({
  args: { id: v.id("lifecycleJobs"), index: v.number() },
  handler: (ctx, { id, index }) =>
    ctx.db
      .query("exportParts")
      .withIndex("by_job", (q) => q.eq("jobId", id).eq("index", index))
      .unique(),
});
export const complete = internalMutation({
  args: { id: v.id("lifecycleJobs"), key: v.string() },
  handler: async (ctx, { id, key }) => {
    const job = await ctx.db.get(id),
      a = job ? await ctx.db.get(job.athleteId) : null;
    if (!job || job.status !== "finalizing" || a?.status !== "active")
      return false;
    await ctx.db.patch(id, {
      status: "complete",
      key,
      finishedAt: Date.now(),
      error: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.email.enqueue, {
      athleteId: job.athleteId,
      template: "export",
      dedupeKey: `export-${id}`,
    });
    return true;
  },
});
export const resumeFinalization = internalMutation({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (job?.status !== "finalizing") return;
    const attempts = (job.attempts ?? 0) + 1;
    await ctx.db.patch(id, {
      attempts,
      status: attempts >= 4 ? "failed" : "finalizing",
      error:
        attempts >= 4
          ? "Export manifest could not finish. Retry to recover it."
          : undefined,
    });
    if (attempts < 4) {
      await ctx.scheduler.runAfter(0, internal.exportActions.finalize, { id });
      await ctx.scheduler.runAfter(
        11 * 60000,
        internal.exports.resumeFinalization,
        { id },
      );
    }
  },
});
export const expirePage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("lifecycleJobs")
      .withIndex("by_created", (q) =>
        q.lt("createdAt", Date.now() - EXPORT_RETENTION_MS),
      )
      .paginate({ cursor: cursor ?? null, numItems: 50 });
    for (const job of page.page)
      if (job.kind === "export" && job.status !== "expired") {
        await ctx.db.patch(job._id, {
          status: "expiring",
          key: undefined,
          error: undefined,
        });
        await ctx.scheduler.runAfter(0, internal.exportActions.cleanup, {
          id: job._id,
        });
      }
    if (!page.isDone)
      await ctx.scheduler.runAfter(1000, internal.exports.expirePage, {
        cursor: page.continueCursor,
      });
  },
});
export const repairLegacy = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("lifecycleJobs")
      .paginate({ cursor: cursor ?? null, numItems: 100 });
    let repaired = 0;
    for (const job of page.page)
      if (
        job.kind === "export" &&
        job.status === "running" &&
        job.lease === undefined
      ) {
        await ctx.db.patch(job._id, { status: "retrying" });
        await ctx.scheduler.runAfter(0, internal.exportActions.run, {
          id: job._id,
        });
        repaired++;
      }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.exports.repairLegacy, {
        cursor: page.continueCursor,
      });
    return { repaired, complete: page.isDone };
  },
});
