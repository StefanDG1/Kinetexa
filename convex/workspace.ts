import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAthlete } from "./athletes";
import { querySchema, runQuery } from "../packages/core/query";
import { thresholdsSchema, sportSchema, clean } from "../packages/core/model";
import { rateLimit } from "./limits";
import { internal } from "./_generated/api";
import { recordProductEvent } from "./telemetryModel";

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    const [
      gear,
      goals,
      plans,
      analyses,
      privacyZones,
      shares,
      billing,
      messages,
      jobs,
    ] = await Promise.all([
      ctx.db
        .query("gear")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
      ctx.db
        .query("goals")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
      ctx.db
        .query("plans")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
      ctx.db
        .query("analyses")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
      ctx.db
        .query("privacyZones")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
      ctx.db
        .query("shares")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
      ctx.db
        .query("billing")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .unique(),
      ctx.db
        .query("messages")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .order("desc")
        .take(50),
      ctx.db
        .query("lifecycleJobs")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .collect(),
    ]);
    return {
      gear,
      goals,
      plans,
      analyses,
      privacyZones,
      shares,
      billing,
      messages: messages.reverse(),
      jobs,
    };
  },
});
export const settings = mutation({
  args: {
    thresholds: v.any(),
    dashboard: v.array(v.string()),
    hiddenWidgets: v.array(v.string()),
    insightConsent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    const thresholds = thresholdsSchema.parse(args.thresholds);
    if (args.dashboard.length > 30 || args.hiddenWidgets.length > 30)
      throw new ConvexError("Too many dashboard widgets.");
    await ctx.db.patch(a._id, { ...args, thresholds: clean(thresholds) });
    if (args.insightConsent && a.aiConsent && !a.insightConsent)
      await ctx.scheduler.runAfter(1000, internal.aiActions.refreshInsight, {
        athleteId: a._id,
      });
    if (JSON.stringify(thresholds) !== JSON.stringify(a.thresholds ?? {}))
      await ctx.scheduler.runAfter(0, internal.reprocessing.page, {
        athleteId: a._id,
        cursor: null,
      });
  },
});
export const saveGear = mutation({
  args: {
    id: v.optional(v.id("gear")),
    name: v.string(),
    kind: v.string(),
    retired: v.boolean(),
    maintenanceKm: v.optional(v.number()),
    maintenanceHours: v.optional(v.number()),
    servicedAt: v.number(),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "edit", 500);
    if (
      !args.name.trim() ||
      args.name.length > 100 ||
      !["bicycle", "running shoe", "equipment"].includes(args.kind) ||
      ![
        args.servicedAt,
        args.maintenanceKm ?? 0,
        args.maintenanceHours ?? 0,
      ].every(Number.isFinite) ||
      (args.maintenanceKm ?? 0) < 0 ||
      (args.maintenanceHours ?? 0) < 0 ||
      Number.isNaN(new Date(args.servicedAt).getTime()) ||
      args.servicedAt > Date.now()
    )
      throw new ConvexError("Check the gear name and service interval.");
    if (id) {
      const old = await ctx.db.get(id);
      if (old?.athleteId !== a._id) throw new ConvexError("Gear unavailable.");
      await ctx.db.patch(id, {
        ...args,
        maintenanceKm: args.maintenanceKm,
        maintenanceHours: args.maintenanceHours,
      });
      return id;
    }
    return ctx.db.insert("gear", { ...args, athleteId: a._id });
  },
});
export const saveGoal = mutation({
  args: {
    id: v.optional(v.id("goals")),
    title: v.string(),
    kind: v.string(),
    target: v.number(),
    start: v.number(),
    end: v.number(),
    manualProgress: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "edit", 500);
    if (
      !args.title.trim() ||
      args.title.length > 120 ||
      args.target <= 0 ||
      ![args.target, args.start, args.end, args.manualProgress ?? 0].every(
        Number.isFinite,
      ) ||
      (args.manualProgress ?? 0) < 0 ||
      (args.kind === "raceTime" &&
        args.manualProgress !== undefined &&
        args.manualProgress <= 0) ||
      (args.kind === "event" &&
        (args.target !== 1 ||
          (args.manualProgress !== undefined &&
            ![0, 1].includes(args.manualProgress)))) ||
      args.end <= args.start ||
      [args.start, args.end].some((value) =>
        Number.isNaN(new Date(value).getTime()),
      ) ||
      ![
        "distance",
        "duration",
        "elevation",
        "count",
        "event",
        "raceTime",
        "custom",
      ].includes(args.kind)
    )
      throw new ConvexError("Check the goal target and dates.");
    if (id) {
      const old = await ctx.db.get(id);
      if (old?.athleteId !== a._id) throw new ConvexError("Goal unavailable.");
      await ctx.db.patch(id, { ...args, manualProgress: args.manualProgress });
      return id;
    }
    await recordProductEvent(ctx, a, "goal_created");
    return ctx.db.insert("goals", { ...args, athleteId: a._id });
  },
});
export const savePlan = mutation({
  args: {
    id: v.optional(v.id("plans")),
    title: v.string(),
    sport: v.string(),
    start: v.number(),
    duration: v.number(),
    description: v.string(),
    intensity: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "edit", 500);
    if (
      !args.title.trim() ||
      args.title.length > 120 ||
      args.duration < 0 ||
      args.duration > 172800 ||
      args.description.length > 5000 ||
      ![args.start, args.duration].every(Number.isFinite) ||
      Number.isNaN(new Date(args.start).getTime()) ||
      !sportSchema.safeParse(args.sport).success ||
      (args.intensity?.length ?? 0) > 80
    )
      throw new ConvexError("Check the workout title and duration.");
    if (id) {
      const old = await ctx.db.get(id);
      if (old?.athleteId !== a._id)
        throw new ConvexError("Workout unavailable.");
      await ctx.db.patch(id, { ...args, intensity: args.intensity });
      return id;
    }
    await recordProductEvent(ctx, a, "calendar_workout_planned");
    return ctx.db.insert("plans", { ...args, athleteId: a._id });
  },
});
export const saveAnalysis = mutation({
  args: {
    id: v.optional(v.id("analyses")),
    name: v.string(),
    query: v.any(),
    pinned: v.boolean(),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "query", 100);
    if (!args.name.trim() || args.name.length > 120)
      throw new ConvexError("Name your analysis.");
    const data = { ...args, query: clean(querySchema.parse(args.query)) };
    if (id) {
      const old = await ctx.db.get(id);
      if (old?.athleteId !== a._id)
        throw new ConvexError("Analysis unavailable.");
      await ctx.db.patch(id, data);
      await recordProductEvent(ctx, a, "analysis_saved");
      return id;
    }
    await recordProductEvent(ctx, a, "analysis_saved");
    return ctx.db.insert("analyses", { ...data, athleteId: a._id });
  },
});
export const preview = mutation({
  args: { query: v.any() },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "query", 100);
    const rows = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .take(10001);
    if (rows.length > 10000)
      throw new ConvexError("Use paginated query execution for this history.");
    return runQuery(
      rows.filter((r) => !r.mergedInto),
      args.query,
    );
  },
});
export const authorizeQuery = mutation({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "query", 100);
    await recordProductEvent(ctx, a, "analysis_query_run");
  },
});
export const saveZone = mutation({
  args: {
    id: v.optional(v.id("privacyZones")),
    name: v.string(),
    lat: v.number(),
    lon: v.number(),
    radius: v.number(),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "edit", 500);
    if (
      !args.name.trim() ||
      args.name.length > 100 ||
      Math.abs(args.lat) > 90 ||
      ![args.lat, args.lon, args.radius].every(Number.isFinite) ||
      Math.abs(args.lon) > 180 ||
      args.radius < 100 ||
      args.radius > 10000
    )
      throw new ConvexError(
        "Use a valid location and radius between 100 and 10,000 metres.",
      );
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: id ? "privacy_zone_updated" : "privacy_zone_added",
      at: Date.now(),
    });
    if (id) {
      const old = await ctx.db.get(id);
      if (!old || old.athleteId !== a._id)
        throw new ConvexError("Privacy zone unavailable.");
      await ctx.db.patch(id, args);
      return id;
    }
    return ctx.db.insert("privacyZones", { ...args, athleteId: a._id });
  },
});

export const remove = mutation({
  args: {
    id: v.union(
      v.id("goals"),
      v.id("plans"),
      v.id("analyses"),
      v.id("privacyZones"),
    ),
  },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      row = await ctx.db.get(id);
    if (!row || row.athleteId !== a._id)
      throw new ConvexError("Item unavailable.");
    await rateLimit(ctx, a._id, "edit", 500);
    await ctx.db.delete(id);
    const kind = ctx.db.normalizeId("goals", id)
      ? "goal"
      : ctx.db.normalizeId("plans", id)
        ? "planned_workout"
        : ctx.db.normalizeId("analyses", id)
          ? "analysis"
          : "privacy_zone";
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: `${kind}_deleted`,
      at: Date.now(),
    });
  },
});
