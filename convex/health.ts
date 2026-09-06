import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAthlete } from "./athletes";
import { HEALTH_METRICS } from "../packages/core/health";
export const status = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx),
      source = await ctx.db
        .query("sources")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .first();
    const available = await Promise.all(
      Object.keys(HEALTH_METRICS).map(async (kind) => ({
        kind,
        available: Boolean(
          await ctx.db
            .query("health")
            .withIndex("by_kind", (q) =>
              q.eq("athleteId", a._id).eq("kind", kind),
            )
            .first(),
        ),
      })),
    );
    return {
      enabled: a.healthProcessing !== false,
      hasSource: Boolean(source),
      available,
    };
  },
});
export const page = query({
  args: {
    from: v.string(),
    to: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(args.from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(args.to) ||
      args.from > args.to
    )
      throw new ConvexError("Choose a valid date range.");
    return ctx.db
      .query("health")
      .withIndex("by_athlete", (q) =>
        q.eq("athleteId", a._id).gte("date", args.from).lte("date", args.to),
      )
      .paginate({ ...args.paginationOpts, numItems: 100 });
  },
});
export const setProcessing = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const a = await requireAthlete(ctx);
    await ctx.db.patch(a._id, { healthProcessing: enabled });
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: enabled
        ? "health_processing_enabled"
        : "health_processing_disabled",
      at: Date.now(),
    });
  },
});
