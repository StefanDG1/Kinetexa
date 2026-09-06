import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalQuery, type ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireRun } from "./ai";
import { type AiPlan } from "../packages/core/ai";
import {
  type ToolData,
  type ToolActivity,
  evaluateTool,
} from "../packages/core/ai-tools";
import { querySchema } from "../packages/core/query";
import { dayKey } from "../packages/core/dashboard";

const tableValidator = v.union(
  v.literal("activities"),
  v.literal("health"),
  v.literal("goals"),
  v.literal("gear"),
  v.literal("analyses"),
);
type Table = "activities" | "health" | "goals" | "gear" | "analyses";
export const page = internalQuery({
  args: {
    runId: v.id("aiRuns"),
    table: tableValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const { athlete } = await requireRun(ctx, args.runId);
    const result = await ctx.db
      .query(args.table)
      .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
      .paginate({ ...args.paginationOpts, numItems: 100 });
    let excluded = 0;
    const page = [];
    for (const row of result.page) {
      if ("mergedInto" in row && row.mergedInto) continue;
      if (args.table === "activities" || args.table === "health") {
        const sourceId = "sourceId" in row ? row.sourceId : undefined,
          source = sourceId ? await ctx.db.get(sourceId) : null;
        if (
          !source ||
          source.athleteId !== athlete._id ||
          source.externalAi !== "allowed"
        ) {
          excluded++;
          continue;
        }
      }
      page.push(row);
    }
    return { ...result, page, excluded };
  },
});
export async function readToolData(
  ctx: ActionCtx,
  runId: Id<"aiRuns">,
  timezone: string,
  deadline: number,
  tables: Table[],
): Promise<ToolData> {
  const data: ToolData = {
    activities: [],
    health: [],
    goals: [],
    gear: [],
    analyses: [],
    excluded: 0,
    timezone,
    now: Date.now(),
  };
  let count = 0;
  for (const table of tables) {
    let cursor: string | null = null;
    do {
      if (Date.now() > deadline)
        throw new Error(
          "The request timed out while reading history. Try a narrower question.",
        );
      const result: {
        page: Doc<Table>[];
        excluded: number;
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.aiData.page, {
        runId,
        table,
        paginationOpts: { numItems: 100, cursor },
      });
      count += result.page.length + result.excluded;
      if (count > 50000)
        throw new Error(
          "This request exceeds the AI history limit. Your full history remains available in analytics.",
        );
      data.excluded += result.excluded;
      if (table === "activities")
        data.activities.push(
          ...(result.page as ToolActivity[]).map((a) => ({
            ...a,
            aiEligible: true,
          })),
        );
      else if (table === "health")
        data.health.push(...(result.page as Doc<"health">[]));
      else if (table === "goals")
        data.goals.push(...(result.page as Doc<"goals">[]));
      else if (table === "gear")
        data.gear.push(...(result.page as Doc<"gear">[]));
      else
        data.analyses.push(
          ...(result.page as Doc<"analyses">[]).map((a) => ({
            ...a,
            query: querySchema.parse(a.query),
          })),
        );
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
  }
  return data;
}
export function catalog(data: ToolData, contextId?: string) {
  const activities = [...data.activities]
    .sort((a, b) => b.start - a.start)
    .slice(0, 25);
  const current = contextId
    ? data.activities.find((a) => a._id === contextId)
    : undefined;
  if (contextId && !current)
    throw new Error("The selected activity is unavailable or restricted.");
  const aliases = new Map<string, string>();
  const entries = activities.map((a, i) => {
    const alias = `activity-${i + 1}`;
    aliases.set(alias, a._id);
    return {
      alias,
      sport: a.sport,
      date: dayKey(a.start, data.timezone),
      duration: a.duration,
    };
  });
  if (current) {
    aliases.set("current-activity", current._id);
    const previous = [...data.activities]
      .filter((a) => a.start < current.start && a.sport === current.sport)
      .sort((a, b) => b.start - a.start)[0];
    if (previous) aliases.set("previous-same-sport", previous._id);
    const longRun = [...data.activities]
      .filter(
        (a) =>
          a.start < current.start &&
          a.sport === "running" &&
          a.duration >= 3600,
      )
      .sort((a, b) => b.start - a.start)[0];
    if (longRun) aliases.set("previous-long-run", longRun._id);
  }
  const analyses = data.analyses.slice(0, 25).map((a, i) => {
    const alias = `analysis-${i + 1}`;
    aliases.set(alias, a._id);
    return { alias, name: a.name };
  });
  const goals = data.goals.slice(0, 20).map((g, i) => {
    const alias = `goal-${i + 1}`;
    aliases.set(alias, g._id);
    return { alias, kind: g.kind, name: g.title };
  });
  const gear = data.gear.slice(0, 20).map((g, i) => {
    const alias = `gear-${i + 1}`;
    aliases.set(alias, g._id);
    return { alias, name: g.name };
  });
  return {
    aliases,
    view: {
      activities: entries,
      analyses,
      goals,
      gear,
      catalogIsSample:
        entries.length < data.activities.length ||
        analyses.length < data.analyses.length ||
        goals.length < data.goals.length ||
        gear.length < data.gear.length,
      selectors:
        "For older activities use activity-on:SPORT:YYYY-MM-DD:ORDINAL (chronological, starting at 1). Named saved objects also accept analysis-name:EXACT NAME, goal-name:EXACT NAME or gear-name:EXACT NAME. All selectors resolve only your eligible records.",
      context: current
        ? {
            activity: "current-activity",
            previous: aliases.has("previous-same-sport")
              ? "previous-same-sport"
              : null,
            previousLongRun: aliases.has("previous-long-run")
              ? "previous-long-run (latest earlier run lasting at least an hour)"
              : null,
          }
        : null,
    },
  };
}
export function executePlan(
  plan: AiPlan,
  data: ToolData,
  aliases: Map<string, string>,
) {
  const resolve = (alias: string) => {
    const id = aliases.get(alias);
    if (id) return id;
    const selector =
      /^activity-on:(running|cycling|swimming|walking|other):(\d{4}-\d{2}-\d{2}):([1-9]\d?)$/.exec(
        alias,
      );
    if (selector) {
      const row = data.activities
        .filter(
          (a) =>
            a.sport === selector[1] &&
            dayKey(a.start, data.timezone) === selector[2],
        )
        .sort((a, b) => a.start - b.start)[Number(selector[3]) - 1];
      if (row) return row._id;
    }
    const named = /^(analysis|goal|gear)-name:(.+)$/.exec(alias);
    if (named) {
      const matches = (
        named[1] === "analysis"
          ? data.analyses
          : named[1] === "goal"
            ? data.goals.map((g) => ({ ...g, name: g.title }))
            : data.gear
      ).filter(
        (g) => g.name.toLocaleLowerCase() === named[2].toLocaleLowerCase(),
      );
      if (matches.length === 1) return matches[0]._id;
    }
    if (!id)
      throw new Error(
        "The requested source selector is unavailable. Try a date or a saved analysis.",
      );
    return id!;
  };
  return plan.calls.flatMap((call) => {
    if (call.tool === "getActivity")
      return evaluateTool(
        { ...call, activityId: resolve(call.activityId) },
        data,
      );
    if (call.tool === "compareActivities")
      return evaluateTool(
        { ...call, activityIds: call.activityIds.map(resolve) },
        data,
      );
    if (call.tool === "runSavedAnalyticsQuery")
      return evaluateTool(
        { ...call, analysisId: resolve(call.analysisId) },
        data,
      );
    if (call.tool === "getGoalProgress" && call.goalIds)
      return evaluateTool(
        { ...call, goalIds: call.goalIds.map(resolve) },
        data,
      );
    if (call.tool === "searchActivities" && call.gearId)
      return evaluateTool({ ...call, gearId: resolve(call.gearId) }, data);
    if (call.tool === "runAdHocAnalyticsQuery" && call.query.gear)
      return evaluateTool(
        { ...call, query: { ...call.query, gear: resolve(call.query.gear) } },
        data,
      );
    return evaluateTool(call, data);
  });
}
