import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { collectActivities, collectDashboard } from "./activityData";
import { toolSchema, resolvePeriod, type Evidence } from "../packages/core/ai";
import { evaluateTool, type ToolData } from "../packages/core/ai-tools";
import { dashboardData } from "../packages/core/dashboard";
import { VERSION } from "../packages/core/model";

// This is a deterministic data API. It never invokes a model or consumes AI quota.
export const calculate = action({
  args: { request: v.any() },
  handler: async (ctx, { request }): Promise<Evidence[]> => {
    const call = toolSchema.parse(request);
    const permission = await ctx.runMutation(api.workspace.authorizeQuery, {});
    const profile = await ctx.runQuery(api.athletes.current, {});
    if (!profile) throw new Error("Account unavailable.");
    const [activities, workspace] = await Promise.all([
      collectActivities(ctx),
      ctx.runQuery(api.workspace.overview, {}),
    ]);
    const data: ToolData = {
      activities,
      goals: workspace.goals,
      gear: workspace.gear,
      analyses: workspace.analyses,
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
  args: { from: v.number(), to: v.number() },
  handler: async (
    ctx,
    { from, to },
  ): Promise<
    Omit<ReturnType<typeof dashboardData>, "selected"> & {
      selectedCount: number;
      version: string;
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
    const rows = await collectDashboard(ctx, to);
    const { selected, ...result } = dashboardData(
      rows,
      from,
      to,
      profile.timezone,
    );
    return { ...result, selectedCount: selected.length, version: VERSION };
  },
});
