import { v, ConvexError } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireAthlete } from "./athletes";
import { clean } from "../packages/core/model";
import type { ToolActivity } from "../packages/core/ai-tools";

export async function publishFacts(ctx: MutationCtx, row: Doc<"activities">) {
  const previous = await ctx.db
    .query("activityFacts")
    .withIndex("by_activity", (q) => q.eq("activityId", row._id))
    .unique();
  if (row.mergedInto) {
    if (previous) await ctx.db.delete(previous._id);
    return;
  }
  const {
    laps: _laps,
    sourceMetadata: _sourceMetadata,
    ...summary
  } = row.summary;
  const data = clean({
    _id: row._id,
    sourceId: row.sourceId,
    title: row.title,
    sport: row.sport,
    start: row.start,
    duration: row.duration,
    distance: row.distance,
    summary,
    metrics: row.metrics,
    gearIds: row.gearIds,
    tags: row.tags,
    excludedRecords: row.excludedRecords,
    hasRoute: row.route.length > 1,
    version: row.version,
  });
  const value = {
    athleteId: row.athleteId,
    activityId: row._id,
    start: row.start,
    data,
  };
  if (previous) await ctx.db.replace(previous._id, value);
  else await ctx.db.insert("activityFacts", value);
}
export async function prepareAthlete(
  ctx: MutationCtx,
  athlete: Doc<"athletes">,
) {
  if (athlete.factsReady) return true;
  const page = await ctx.db
    .query("activities")
    .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
    .paginate({
      cursor: athlete.factsCursor ?? null,
      numItems: 30,
      maximumBytesRead: 4 * 1024 * 1024,
    });
  for (const row of page.page) await publishFacts(ctx, row);
  await ctx.db.patch(athlete._id, {
    factsReady: page.isDone,
    factsCursor: page.isDone ? undefined : page.continueCursor,
  });
  return page.isDone;
}
export const prepare = mutation({
  args: {},
  handler: async (ctx) => {
    return prepareAthlete(ctx, await requireAthlete(ctx));
  },
});
export const rebuild = internalMutation({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }) => {
    const athlete = await ctx.db.get(athleteId);
    if (!athlete || athlete.status !== "active")
      throw new Error("Account unavailable.");
    await ctx.db.patch(athleteId, {
      factsReady: false,
      factsCursor: undefined,
    });
  },
});
export const page = query({
  args: {
    cursor: v.union(v.string(), v.null()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    sport: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const athlete = await requireAthlete(ctx);
    if (!athlete.factsReady)
      throw new ConvexError("Prepare the activity index before reading it.");
    const result = await ctx.db
      .query("activityFacts")
      .withIndex("by_athlete", (q) =>
        q
          .eq("athleteId", athlete._id)
          .gte("start", args.from ?? 0)
          .lte("start", args.to ?? 8640000000000000),
      )
      .order("desc")
      .paginate({
        cursor: args.cursor,
        numItems: 1000,
        maximumBytesRead: 6 * 1024 * 1024,
      });
    const policies = new Map<string, boolean>();
    const page: ToolActivity[] = [];
    for (const row of result.page) {
      if (args.sport && row.data.sport !== args.sport) continue;
      if (!policies.has(row.data.sourceId)) {
        const source = await ctx.db.get(
          row.data.sourceId as Doc<"sources">["_id"],
        );
        policies.set(
          row.data.sourceId,
          source?.athleteId === athlete._id && source.externalAi === "allowed",
        );
      }
      page.push({ ...row.data, aiEligible: policies.get(row.data.sourceId) });
    }
    return { ...result, page };
  },
});

export const dashboardPage = query({
  args: { cursor: v.union(v.string(), v.null()), to: v.number() },
  handler: async (ctx, { cursor, to }) => {
    const athlete = await requireAthlete(ctx);
    if (!athlete.factsReady)
      throw new ConvexError("Prepare the activity index before reading it.");
    const result = await ctx.db
      .query("activityFacts")
      .withIndex("by_athlete", (q) =>
        q.eq("athleteId", athlete._id).lte("start", to),
      )
      .paginate({ cursor, numItems: 1000, maximumBytesRead: 6 * 1024 * 1024 });
    return {
      ...result,
      page: result.page.map(({ data: r }) =>
        clean({
          _id: r._id,
          sport: r.sport,
          start: r.start,
          duration: r.duration,
          distance: r.distance,
          summary: { elevationGain: r.summary.elevationGain },
          metrics: {
            metrics: { load: r.metrics.metrics.load },
            hrZones: r.metrics.hrZones,
          },
          gearIds: r.gearIds,
          tags: r.tags,
        }),
      ),
    };
  },
});
