import { v, ConvexError } from "convex/values";
import { mutation, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
export const request = mutation({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "reprocess", 4, 86400000);
    await ctx.scheduler.runAfter(0, internal.reprocessing.page, {
      athleteId: a._id,
      cursor: null,
    });
  },
});
export const page = internalMutation({
  args: { athleteId: v.id("athletes"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.athleteId);
    if (!a || a.status !== "active") return;
    const result = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .paginate({ cursor: args.cursor, numItems: 20 });
    for (const row of result.page)
      await ctx.scheduler.runAfter(0, internal.reprocessingActions.activity, {
        id: row._id,
      });
    if (!result.isDone)
      await ctx.scheduler.runAfter(2000, internal.reprocessing.page, {
        athleteId: a._id,
        cursor: result.continueCursor,
      });
  },
});
export const get = internalQuery({
  args: { id: v.id("activities") },
  handler: async (ctx, { id }) => {
    const activity = await ctx.db.get(id);
    if (!activity) return null;
    const a = await ctx.db.get(activity.athleteId);
    if (!a || a.status !== "active") return null;
    const source = await ctx.db.get(activity.sourceId);
    return { activity, source, thresholds: a.thresholds ?? {} };
  },
});
export const save = internalMutation({
  args: {
    id: v.id("activities"),
    metrics: v.any(),
    summary: v.any(),
    route: v.array(v.array(v.number())),
    version: v.string(),
  },
  handler: async (ctx, { id, ...args }) => {
    const old = await ctx.db.get(id);
    if (!old) return;
    const a = await ctx.db.get(old.athleteId);
    if (!a || a.status !== "active") return;
    await ctx.db.insert("metricHistory", {
      athleteId: old.athleteId,
      activityId: id,
      metrics: old.metrics,
      at: Date.now(),
    });
    await ctx.db.patch(id, {
      ...args,
      sport: args.summary.sport,
      start: args.summary.start,
      duration: args.summary.duration,
      distance: args.summary.distance,
    });
  },
});
