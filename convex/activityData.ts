import type { ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";
export async function collectActivities(
  ctx: ActionCtx,
  filter: { from?: number; to?: number; sport?: string } = {},
): Promise<Doc<"activities">[]> {
  const rows: Doc<"activities">[] = [];
  let cursor: string | null = null;
  do {
    const result: {
      page: Doc<"activities">[];
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(api.activities.page, {
      ...filter,
      paginationOpts: { numItems: 100, cursor },
    });
    rows.push(...result.page);
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return rows;
}
