import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAthlete } from "./athletes";
import type { QueryCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import { simplifySegments, type Point } from "../packages/core/geo";
import { publishFacts } from "./activityFacts";
import { duplicateAssessment } from "../packages/core/dedup";
export async function ownedActivity(ctx: QueryCtx, id: Id<"activities">) {
  const a = await requireAthlete(ctx),
    row = await ctx.db.get(id);
  if (!row || row.athleteId !== a._id)
    throw new ConvexError("Activity unavailable.");
  return row;
}
export const selection = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const athlete = await requireAthlete(ctx);
    const normalized = ctx.db.normalizeId("activities", id);
    const row = normalized ? await ctx.db.get(normalized) : null;
    if (!row || row.athleteId !== athlete._id || row.mergedInto) return null;
    return { _id: row._id, title: row.title };
  },
});
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
          .lte("start", args.to ?? 8640000000000000),
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
          .lte("start", args.to ?? 8640000000000000),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
        maximumBytesRead: 4 * 1024 * 1024,
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
export const browse = query({
  args: {
    paginationOpts: paginationOptsValidator,
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    sport: v.optional(v.string()),
    search: v.optional(v.string()),
    view: v.union(v.literal("list"), v.literal("map"), v.literal("picker")),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    if (
      (args.search?.length ?? 0) > 240 ||
      (args.from !== undefined && args.to !== undefined && args.from > args.to)
    )
      throw new ConvexError("Choose valid history filters.");
    const result = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) =>
        q
          .eq("athleteId", a._id)
          .gte("start", args.from ?? -8640000000000000)
          .lte("start", args.to ?? 8640000000000000),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
        maximumBytesRead: 2_000_000,
      });
    const search = args.search?.trim().toLocaleLowerCase();
    return {
      ...result,
      page: result.page
        .filter(
          (r) =>
            !r.mergedInto &&
            (!args.sport || r.sport === args.sport) &&
            (!search ||
              `${r.title} ${r.tags.join(" ")}`
                .toLocaleLowerCase()
                .includes(search)) &&
            (args.view !== "map" || r.route.length > 1),
        )
        .map((r) => {
          const segments =
            args.view === "picker"
              ? []
              : simplifySegments(
                  (r.routeSegments ?? [r.route]) as Point[][],
                  args.view === "map" ? 300 : 60,
                );
          return {
            _id: r._id,
            title: r.title,
            sport: r.sport,
            start: r.start,
            duration: r.duration,
            distance: r.distance,
            tags: r.tags,
            load: r.metrics.metrics?.load?.value ?? null,
            route: segments.flat(),
            routeSegments: segments,
          };
        }),
    };
  },
});
export const provenance = query({
  args: { id: v.id("activities"), overviewOnly: v.optional(v.boolean()) },
  handler: async (ctx, { id, overviewOnly }) => {
    const row = await ownedActivity(ctx, id),
      source = await ctx.db.get(row.sourceId);
    const history = overviewOnly
      ? []
      : await ctx.db
          .query("metricHistory")
          .withIndex("by_activity", (q) => q.eq("activityId", id))
          .filter((q) => q.eq(q.field("athleteId"), row.athleteId))
          .order("desc")
          .take(26);
    const sources = overviewOnly
      ? []
      : await ctx.db
          .query("sources")
          .withIndex("by_activity", (q) => q.eq("activityId", id))
          .filter((q) => q.eq(q.field("athleteId"), row.athleteId))
          .take(101);
    return {
      source:
        source?.athleteId === row.athleteId
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
      sources: sources.slice(0, 100).map(provenanceSource),
      history: history.slice(0, 25),
      hasMore: { sources: sources.length > 100, history: history.length > 25 },
    };
  },
});
function provenanceSource(s: Doc<"sources">) {
  return {
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
    mime: s.mime,
    receivedAt: s.receivedAt,
    completedAt: s.completedAt,
  };
}
export const provenancePage = query({
  args: {
    id: v.id("activities"),
    kind: v.union(v.literal("sources"), v.literal("history")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { id, kind, paginationOpts }) => {
    const row = await ownedActivity(ctx, id);
    if (kind === "sources") {
      const result = await ctx.db
        .query("sources")
        .withIndex("by_activity", (q) => q.eq("activityId", id))
        .paginate({
          ...paginationOpts,
          numItems: Math.min(100, Math.max(1, paginationOpts.numItems)),
          maximumBytesRead: 2_000_000,
        });
      return {
        ...result,
        kind,
        page: result.page
          .filter((s) => s.athleteId === row.athleteId)
          .map(provenanceSource),
      };
    }
    const result = await ctx.db
      .query("metricHistory")
      .withIndex("by_activity", (q) => q.eq("activityId", id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(25, Math.max(1, paginationOpts.numItems)),
        maximumBytesRead: 2_000_000,
      });
    return {
      ...result,
      kind,
      page: result.page.filter((h) => h.athleteId === row.athleteId),
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
    await publishFacts(ctx, (await ctx.db.get(id))!);
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
    await ctx.db.patch(id, {
      mergedInto: into,
      duplicateOf: into ?? row.duplicateOf,
      duplicateDismissed: !into,
    });
    await publishFacts(ctx, (await ctx.db.get(id))!);
    await ctx.db.insert("auditEvents", {
      athleteId: row.athleteId,
      action: into ? "activity_merged" : "activity_unmerged",
      at: Date.now(),
    });
  },
});

function member(row: Doc<"activities">) {
  return {
    id: row._id,
    title: row.title,
    sport: row.sport,
    start: row.start,
    sourceId: row.sourceId,
  };
}
export const duplicate = query({
  args: { id: v.id("activities") },
  handler: async (ctx, { id }) => {
    const row = await ownedActivity(ctx, id);
    const targetId = row.mergedInto ?? row.duplicateOf;
    if (!targetId) return null;
    let target = await ctx.db.get(targetId);
    if (!target || target.athleteId !== row.athleteId) return null;
    // Suggestions imported before a later merge point to the surviving workout.
    if (target.mergedInto) target = await ctx.db.get(target.mergedInto);
    if (
      !target ||
      target.athleteId !== row.athleteId ||
      target._id === id ||
      target.mergedInto
    )
      return null;
    const assessment = duplicateAssessment(row.summary, target.summary);
    if (!row.mergedInto && assessment.score < assessment.suggestionThreshold)
      return null;
    return {
      status: row.mergedInto
        ? ("merged" as const)
        : row.duplicateDismissed
          ? ("kept-separate" as const)
          : ("suggested" as const),
      target: member(target),
      assessment,
    };
  },
});
export const keepSeparate = mutation({
  args: { id: v.id("activities") },
  handler: async (ctx, { id }) => {
    const row = await ownedActivity(ctx, id);
    if (row.mergedInto)
      throw new ConvexError(
        "Undo the merge before keeping these activities separate.",
      );
    if (!row.duplicateOf)
      throw new ConvexError("No duplicate suggestion is available.");
    await ctx.db.patch(id, { duplicateDismissed: true });
    await ctx.db.insert("auditEvents", {
      athleteId: row.athleteId,
      action: "duplicate_kept_separate",
      at: Date.now(),
    });
  },
});
export const mergeMembersPage = query({
  args: { id: v.id("activities"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { id, paginationOpts }) => {
    const row = await ownedActivity(ctx, id);
    const result = await ctx.db
      .query("activities")
      .withIndex("by_merged", (q) => q.eq("mergedInto", id))
      .paginate({
        ...paginationOpts,
        numItems: Math.min(100, Math.max(1, paginationOpts.numItems)),
        maximumBytesRead: 2_000_000,
      });
    return {
      ...result,
      page: result.page
        .filter((r) => r.athleteId === row.athleteId)
        .map(member),
    };
  },
});
