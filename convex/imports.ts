import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { duplicateConfidence } from "../packages/core/dedup";
import { VERSION } from "../packages/core/model";
import { rateLimit } from "./limits";
import { dayKey } from "../packages/core/dashboard";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("sources")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .take(500);
  },
});
export const reserve = mutation({
  args: { name: v.string(), bytes: v.number(), nonce: v.string() },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "upload", 100);
    if (
      !/\.(fit|tcx|gpx|zip)$/i.test(args.name) ||
      args.name.length > 240 ||
      args.bytes < 1 ||
      args.bytes > (/\.zip$/i.test(args.name) ? 128 : 32) * 1024 * 1024 ||
      !/^[a-f0-9-]{36}$/.test(args.nonce)
    )
      throw new ConvexError("Choose a supported file within the upload limit.");
    return ctx.db.insert("sources", {
      athleteId: a._id,
      name: args.name,
      key: `${a._id}/originals/${args.nonce}`,
      bytes: args.bytes,
      status: "awaiting-upload",
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});
export const owned = query({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      s = await ctx.db.get(id);
    if (!s || s.athleteId !== a._id) throw new ConvexError("File unavailable.");
    return s;
  },
});
export const enqueue = mutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      s = await ctx.db.get(id);
    if (!s || s.athleteId !== a._id) throw new ConvexError("File unavailable.");
    if (!["awaiting-upload", "failed"].includes(s.status)) return;
    await rateLimit(ctx, a._id, "import", 100);
    await ctx.db.patch(id, { status: "queued", error: undefined });
    await ctx.scheduler.runAfter(0, internal.processing.process, { id });
  },
});
export const get = internalQuery({
  args: { id: v.id("sources") },
  handler: (ctx, { id }) => ctx.db.get(id),
});
export const claim = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (!s || !["queued", "retrying"].includes(s.status)) return null;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return null;
    await ctx.db.patch(id, { status: "running", attempts: s.attempts + 1 });
    await ctx.scheduler.runAfter(660000, internal.imports.watchdog, {
      id,
      attempt: s.attempts + 1,
    });
    return { source: s, thresholds: a.thresholds ?? {} };
  },
});
export const failed = internalMutation({
  args: { id: v.id("sources"), message: v.string(), retryable: v.boolean() },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s) return;
    const retry = args.retryable && s.attempts < 4;
    await ctx.db.patch(s._id, {
      status: retry ? "retrying" : "failed",
      error: args.message,
    });
    if (retry)
      await ctx.scheduler.runAfter(
        Math.min(300000, 2000 * 2 ** s.attempts) +
          Math.floor(Math.random() * 1000),
        internal.processing.process,
        { id: s._id },
      );
  },
});
export const complete = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    summary: v.any(),
    metrics: v.any(),
    route: v.array(v.array(v.number())),
    streamKey: v.string(),
  },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s) return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active")
      throw new ConvexError("Account unavailable.");
    if (s.status === "complete") return;
    const exact = await ctx.db
      .query("sources")
      .withIndex("by_hash", (q) =>
        q.eq("athleteId", s.athleteId).eq("hash", args.hash),
      )
      .filter((q) => q.eq(q.field("status"), "complete"))
      .first();
    if (exact?.activityId) {
      await ctx.db.patch(s._id, {
        status: "duplicate",
        hash: args.hash,
        activityId: exact.activityId,
        parserVersion: VERSION,
      });
      return;
    }
    const near = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) =>
        q
          .eq("athleteId", s.athleteId)
          .gte("start", args.summary.start - 60000)
          .lte("start", args.summary.start + 60000),
      )
      .collect();
    const duplicate = near.find(
      (n) => duplicateConfidence(n.summary, args.summary) >= 0.7,
    );
    const meta = s.importMetadata as
      import("../packages/core/import").MigrationMetadata | undefined;
    const gearIds: import("./_generated/dataModel").Id<"gear">[] = [];
    if (meta?.gear) {
      const existing = await ctx.db
        .query("gear")
        .withIndex("by_athlete", (q) => q.eq("athleteId", s.athleteId))
        .filter((q) => q.eq(q.field("name"), meta.gear))
        .first();
      gearIds.push(
        existing?._id ??
          (await ctx.db.insert("gear", {
            athleteId: s.athleteId,
            name: meta.gear,
            kind: args.summary.sport === "cycling" ? "bicycle" : "running shoe",
            retired: false,
            servicedAt: 0,
          })),
      );
    }
    const id = await ctx.db.insert("activities", {
      athleteId: s.athleteId,
      title: meta?.title || args.summary.title,
      sport: args.summary.sport,
      start: args.summary.start,
      duration: args.summary.duration,
      distance: args.summary.distance,
      summary: args.summary,
      metrics: args.metrics,
      route: args.route,
      streamKey: args.streamKey,
      sourceId: s._id,
      notes: meta?.notes || "",
      tags: meta?.commute ? ["commute"] : [],
      gearIds,
      excludedRecords: false,
      version: VERSION,
      createdAt: Date.now(),
      duplicateOf: duplicate?._id,
    });
    await ctx.db.patch(s._id, {
      status: "complete",
      hash: args.hash,
      activityId: id,
      parserVersion: VERSION,
    });
    if (!s.parentId)
      await ctx.scheduler.runAfter(0, internal.email.enqueue, {
        athleteId: s.athleteId,
        template: "import",
        dedupeKey: `import-${s._id}`,
      });
  },
});
export const child = internalMutation({
  args: {
    parentId: v.id("sources"),
    name: v.string(),
    key: v.string(),
    bytes: v.number(),
    hash: v.string(),
    importMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.parentId);
    if (!p) throw new ConvexError("Archive unavailable.");
    const old = await ctx.db
      .query("sources")
      .withIndex("by_hash", (q) =>
        q.eq("athleteId", p.athleteId).eq("hash", args.hash),
      )
      .first();
    if (old) return old._id;
    const id = await ctx.db.insert("sources", {
      ...args,
      athleteId: p.athleteId,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.processing.process, { id });
    return id;
  },
});
export const archiveComplete = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    childIds: v.array(v.id("sources")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "processing-archive",
      hash: args.hash,
      parserVersion: VERSION,
      childIds: args.childIds,
    });
    await ctx.scheduler.runAfter(1000, internal.imports.archiveProgress, {
      id: args.id,
    });
  },
});
export const watchdog = internalMutation({
  args: { id: v.id("sources"), attempt: v.number() },
  handler: async (ctx, { id, attempt }) => {
    const s = await ctx.db.get(id);
    if (!s || s.status !== "running" || s.attempts !== attempt) return;
    const retry = s.attempts < 4;
    await ctx.db.patch(id, {
      status: retry ? "retrying" : "failed",
      error: retry
        ? "Processing was interrupted. Retrying from the retained original."
        : "Processing was interrupted repeatedly. Your original is retained; retry from import history.",
    });
    if (retry)
      await ctx.scheduler.runAfter(1000, internal.processing.process, { id });
  },
});
export const archiveProgress = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (!s || s.status !== "processing-archive") return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return;
    const children = await Promise.all(
      (s.childIds ?? []).map((id) => ctx.db.get(id)),
    );
    const completed = children.filter(
        (c) => c && ["complete", "duplicate"].includes(c.status),
      ).length,
      failed = children.filter((c) => !c || c.status === "failed").length,
      done = completed + failed === children.length;
    await ctx.db.patch(id, {
      completedChildren: completed,
      failedChildren: failed,
      status: done ? (failed ? "partial" : "complete") : "processing-archive",
    });
    if (!done)
      await ctx.scheduler.runAfter(30000, internal.imports.archiveProgress, {
        id,
      });
    else
      await ctx.scheduler.runAfter(0, internal.email.enqueue, {
        athleteId: s.athleteId,
        template: "import",
        dedupeKey: `import-${id}`,
      });
  },
});
export const health = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    samples: v.array(
      v.object({
        at: v.number(),
        kind: v.string(),
        value: v.number(),
        unit: v.string(),
      }),
    ),
  },
  handler: async (ctx, { id, hash, samples }) => {
    const s = await ctx.db.get(id);
    if (!s) return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return;
    const old = await ctx.db
      .query("sources")
      .withIndex("by_hash", (q) => q.eq("athleteId", a._id).eq("hash", hash))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .first();
    if (old) return;
    const existing = await ctx.db
      .query("health")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .filter((q) => q.eq(q.field("sourceId"), id))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const h of samples)
      await ctx.db.insert("health", {
        ...h,
        date: dayKey(h.at, a.timezone),
        athleteId: a._id,
        source: s.name,
        sourceId: id,
      });
  },
});
export const healthComplete = internalMutation({
  args: { id: v.id("sources"), hash: v.string() },
  handler: async (ctx, { id, hash }) => {
    const s = await ctx.db.get(id);
    if (!s) return;
    await ctx.db.patch(id, {
      status: "complete",
      hash,
      parserVersion: VERSION,
    });
  },
});
