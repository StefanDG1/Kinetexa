import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAthlete } from "./athletes";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { simplifySegments, type Point } from "../packages/core/geo";
export async function ownedActivity(ctx: QueryCtx, id: Id<"activities">) {
  const a = await requireAthlete(ctx),
    row = await ctx.db.get(id);
  if (!row || row.athleteId !== a._id)
    throw new ConvexError("Activity unavailable.");
  return row;
}
export const list = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    sport: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    const rows = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) =>
        q
          .eq("athleteId", a._id)
          .gte("start", args.from ?? 0)
          .lte("start", args.to ?? Date.now() + 86400000),
      )
      .order("desc")
      .take(10001);
    if (rows.length > 10000)
      throw new ConvexError(
        "Use paginated activity history for this date range.",
      );
    return rows.filter(
      (r) => !r.mergedInto && (!args.sport || r.sport === args.sport),
    );
  },
});
export const page = query({
  args: {
    paginationOpts: paginationOptsValidator,
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    sport: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    const result = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) =>
        q
          .eq("athleteId", a._id)
          .gte("start", args.from ?? 0)
          .lte("start", args.to ?? Date.now() + 86400000),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
      });
    return {
      ...result,
      page: await Promise.all(
        result.page
          .filter(
            (r) => !r.mergedInto && (!args.sport || r.sport === args.sport),
          )
          .map(async (r) => {
            const source = await ctx.db.get(r.sourceId);
            const step = Math.max(1, Math.ceil(r.route.length / 120));
            const { laps: _laps, ...summary } = r.summary;
            return {
              ...r,
              aiEligible:
                source?.athleteId === a._id && source.externalAi === "allowed",
              summary,
              route: r.route.filter(
                (_, i) => i % step === 0 || i === r.route.length - 1,
              ),
              ...(r.routeSegments
                ? {
                    routeSegments: simplifySegments(
                      r.routeSegments as Point[][],
                      120,
                    ),
                  }
                : {}),
            };
          }),
      ),
    };
  },
});
export const get = query({
  args: { id: v.id("activities") },
  handler: (ctx, { id }) => ownedActivity(ctx, id),
});
export const provenance = query({
  args: { id: v.id("activities") },
  handler: async (ctx, { id }) => {
    const row = await ownedActivity(ctx, id),
      source = await ctx.db.get(row.sourceId);
    const history = await ctx.db
      .query("metricHistory")
      .withIndex("by_activity", (q) => q.eq("activityId", id))
      .order("desc")
      .take(25);
    return {
      source: source
        ? {
            name: source.name,
            hash: source.hash,
            bytes: source.bytes,
            parserVersion: source.parserVersion,
            createdAt: source.createdAt,
            parentId: source.parentId,
            partIndex: source.partIndex,
            format: source.format,
            mime: source.mime,
            receivedAt: source.receivedAt,
            importMetadata: source.importMetadata,
          }
        : null,
      sources: (
        await ctx.db
          .query("sources")
          .withIndex("by_activity", (q) => q.eq("activityId", id))
          .filter((q) => q.eq(q.field("athleteId"), row.athleteId))
          .take(100)
      ).map((s) => ({
        id: s._id,
        name: s.name,
        hash: s.hash,
        parserVersion: s.parserVersion,
        importMetadata: s.importMetadata,
        parentId: s.parentId,
        partIndex: s.partIndex,
        status: s.status,
        bytes: s.bytes,
        format: s.format,
      })),
      history,
    };
  },
});
export const update = mutation({
  args: {
    id: v.id("activities"),
    title: v.string(),
    notes: v.string(),
    tags: v.array(v.string()),
    gearIds: v.array(v.id("gear")),
    excludedRecords: v.boolean(),
  },
  handler: async (ctx, { id, ...args }) => {
    const row = await ownedActivity(ctx, id);
    if (
      !args.title.trim() ||
      args.title.length > 240 ||
      args.notes.length > 10000 ||
      args.tags.length > 20 ||
      args.tags.some((t) => t.length > 80) ||
      args.gearIds.length > 20
    )
      throw new ConvexError("Activity details exceed the allowed length.");
    for (const gid of args.gearIds) {
      const g = await ctx.db.get(gid);
      if (!g || g.athleteId !== row.athleteId)
        throw new ConvexError("Gear unavailable.");
    }
    await ctx.db.patch(id, args);
  },
});
export const merge = mutation({
  args: { id: v.id("activities"), into: v.optional(v.id("activities")) },
  handler: async (ctx, { id, into }) => {
    const row = await ownedActivity(ctx, id);
    if (into) {
      const target = await ownedActivity(ctx, into);
      if (id === into || target.mergedInto)
        throw new ConvexError("Choose a separate unmerged activity.");
      if (
        await ctx.db
          .query("activities")
          .withIndex("by_merged", (q) => q.eq("mergedInto", id))
          .first()
      )
        throw new ConvexError(
          "Unmerge this activity's duplicates before merging it into another activity.",
        );
    }
    await ctx.db.patch(id, { mergedInto: into });
    await ctx.db.insert("auditEvents", {
      athleteId: row.athleteId,
      action: into ? "activity_merged" : "activity_unmerged",
      at: Date.now(),
    });
  },
});
