import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { duplicateConfidence } from "../packages/core/import";
import { VERSION } from "../packages/core/model";
import { rateLimit } from "./limits";

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
    const id = await ctx.db.insert("activities", {
      athleteId: s.athleteId,
      title: args.summary.title,
      sport: args.summary.sport,
      start: args.summary.start,
      duration: args.summary.duration,
      distance: args.summary.distance,
      summary: args.summary,
      metrics: args.metrics,
      route: args.route,
      streamKey: args.streamKey,
      sourceId: s._id,
      notes: "",
      tags: [],
      gearIds: [],
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
  },
});
export const child = internalMutation({
  args: {
    parentId: v.id("sources"),
    name: v.string(),
    key: v.string(),
    bytes: v.number(),
    hash: v.string(),
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
  args: { id: v.id("sources"), hash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: "complete",
      hash: args.hash,
      parserVersion: VERSION,
    });
  },
});
