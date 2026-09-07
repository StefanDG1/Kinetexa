import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { collectActivities, collectDashboard } from "./activityData";
import { toolSchema, resolvePeriod, type Evidence } from "../packages/core/ai";
import { evaluateTool, type ToolData } from "../packages/core/ai-tools";
import { dashboardData } from "../packages/core/dashboard";
import { VERSION } from "../packages/core/model";
import { collectWorkspace } from "./workspaceData";
import { goalProgress } from "../packages/core/goals";
import { runQuery } from "../packages/core/query";
import { dateBounds, calendarDate } from "../packages/core/calendar";
import type { Doc } from "./_generated/dataModel";

// This is a deterministic data API. It never invokes a model or consumes AI quota.
export const calculate = action({
  args: { request: v.any() },
  handler: async (ctx, { request }): Promise<Evidence[]> => {
    const call = toolSchema.parse(request);
    const permission = await ctx.runMutation(api.workspace.authorizeQuery, {});
    const profile = await ctx.runQuery(api.athletes.current, {});
    if (!profile) throw new Error("Account unavailable.");
    const [activities, goals, gear, analyses] = await Promise.all([
      collectActivities(ctx),
      call.tool === "getGoalProgress" ? collectWorkspace(ctx, "goals") : [],
      call.tool === "getGearUsage" ? collectWorkspace(ctx, "gear") : [],
      call.tool === "runSavedAnalyticsQuery"
        ? collectWorkspace(ctx, "analyses")
        : [],
    ]);
    const data: ToolData = {
      activities,
      goals,
      gear,
      analyses,
      health: [],
      excluded: 0,
      timezone: profile.timezone,
      now: Date.now(),
    };
    if (call.tool === "getHealthTrend") {
      const period = resolvePeriod(call.period, data.now, data.timezone);
      const from =
        period.comparison && period.comparison.from < period.from
          ? period.comparison.from
          : period.from;
      const to =
        period.comparison && period.comparison.to > period.to
          ? period.comparison.to
          : period.to;
      let cursor: string | null = null;
      do {
        const result: {
          page: ToolData["health"];
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(api.health.page, {
          from,
          to,
          paginationOpts: { numItems: 100, cursor },
        });
        data.health.push(...result.page);
        cursor = result.isDone ? null : result.continueCursor;
      } while (cursor);
    }
    const result = evaluateTool(call, data, false);
    if (
      ["runAdHocAnalyticsQuery", "runSavedAnalyticsQuery"].includes(call.tool)
    )
      await ctx.runMutation(internal.telemetry.queryCompleted, permission);
    return result;
  },
});
export const dashboard = action({
  args: { from: v.number(), to: v.number(), sport: v.optional(v.string()) },
  handler: async (
    ctx,
    { from, to, sport },
  ): Promise<
    Omit<ReturnType<typeof dashboardData>, "selected"> & {
      selectedCount: number;
      version: string;
      goals: (Doc<"goals"> & { progress: ReturnType<typeof goalProgress> })[];
      analyses: {
        id: string;
        name: string;
        query: any;
        results: ReturnType<typeof runQuery>;
        error?: string;
      }[];
    }
  > => {
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from > to ||
      to - from > 366 * 100 * 86400000
    )
      throw new Error("Choose an ordered range of at most 100 years.");
    await ctx.runMutation(api.workspace.authorizeQuery, {});
    const profile = await ctx.runQuery(api.athletes.current, {});
    if (!profile) throw new Error("Account unavailable.");
    const [goals, analyses] = await Promise.all([
      collectWorkspace(ctx, "goals"),
      collectWorkspace(ctx, "analyses"),
    ]);
    const pinned = analyses.filter((a) => a.pinned),
      now = Date.now();
    const rows = pinned.length
      ? await collectActivities(ctx, { to: Math.max(now, to) })
      : await collectDashboard(ctx, Math.max(now, to));
    const { selected, ...result } = dashboardData(
      sport ? rows.filter((r) => r.sport === sport) : rows,
      from,
      to,
      profile.timezone,
    );
    return {
      ...result,
      selectedCount: selected.length,
      version: VERSION,
      goals: goals.map((g) => ({ ...g, progress: goalProgress(g, rows, now) })),
      analyses: pinned.map((a) => {
        const base = { id: a._id, name: a.name, query: a.query };
        try {
          return {
            ...base,
            results: runQuery(
              rows.filter(
                (r) =>
                  r.start >= from &&
                  r.start <= to &&
                  (!sport || r.sport === sport),
              ),
              { ...a.query, timezone: a.query.timezone ?? profile.timezone },
            ),
          };
        } catch (e) {
          return {
            ...base,
            results: [],
            error:
              e instanceof Error ? e.message : "Review the saved analysis.",
          };
        }
      }),
    };
  },
});

export const goals = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    (Doc<"goals"> & { progress: ReturnType<typeof goalProgress> })[]
  > => {
    await ctx.runMutation(api.workspace.authorizeQuery, {});
    const goals = await collectWorkspace(ctx, "goals"),
      now = Date.now();
    const rows = goals.some(
      (g) => !["custom", "raceTime", "event"].includes(g.kind),
    )
      ? await collectDashboard(ctx, now)
      : [];
    return goals.map((g) => ({ ...g, progress: goalProgress(g, rows, now) }));
  },
});
export const records = action({
  args: {
    scope: v.union(
      v.literal("all-time"),
      v.literal("current-year"),
      v.literal("period"),
    ),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Record<"distance" | "power" | "pace", Evidence[]>> => {
    await ctx.runMutation(api.workspace.authorizeQuery, {});
    const profile = await ctx.runQuery(api.athletes.current, {});
    if (!profile) throw new Error("Account unavailable.");
    const now = Date.now(),
      today = calendarDate(now, profile.timezone);
    const period =
      args.scope === "period"
        ? { from: args.from!, to: args.to!, comparison: "none" as const }
        : undefined;
    const bounds = period
      ? dateBounds(period.from, period.to, profile.timezone)
      : args.scope === "current-year"
        ? dateBounds(`${today.slice(0, 4)}-01-01`, today, profile.timezone)
        : { to: now };
    const activities = await collectActivities(ctx, bounds);
    const data: ToolData = {
      activities,
      goals: [],
      gear: [],
      analyses: [],
      health: [],
      excluded: 0,
      timezone: profile.timezone,
      now,
    };
    const calculate = (record: "distance" | "power" | "pace") =>
      evaluateTool(
        {
          tool: "getRecords",
          callId: record,
          record,
          recordScope: args.scope,
          period,
        },
        data,
        false,
      );
    return {
      distance: calculate("distance"),
      power: calculate("power"),
      pace: calculate("pace"),
    };
  },
});
