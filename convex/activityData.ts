import type { ActionCtx } from "./_generated/server";
import type { ToolActivity } from "../packages/core/ai-tools";
import { api } from "./_generated/api";
export async function collectActivities(
  ctx: ActionCtx,
  filter: {
    from?: number;
    to?: number;
    sport?: string;
  } = {},
): Promise<ToolActivity[]> {
  while (!(await ctx.runMutation(api.activityFacts.prepare, {}))) {}
  const rows: ToolActivity[] = [];
  let cursor: string | null = null;
  do {
    const result: {
      page: ToolActivity[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(api.activityFacts.page, {
      ...filter,
      cursor,
    });
    rows.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return rows;
}

export async function collectDashboard(ctx: ActionCtx, to: number) {
  while (!(await ctx.runMutation(api.activityFacts.prepare, {}))) {}
  const rows: import("../packages/core/query").QueryActivity[] = [];
  let cursor: string | null = null;
  do {
    const result: {
      page: typeof rows;
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(api.activityFacts.dashboardPage, { cursor, to });
    rows.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return rows;
}
