import type { ActionCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { api } from "./_generated/api";
import type { FunctionReturnType } from "convex/server";

export async function collectWorkspace<T extends "goals" | "gear" | "analyses">(
  ctx: ActionCtx,
  table: T,
): Promise<Doc<T>[]> {
  const rows: Doc<T>[] = [];
  let cursor: string | null = null;
  do {
    const result: FunctionReturnType<typeof api.workspace.page> =
      await ctx.runQuery(api.workspace.page, {
        table,
        paginationOpts: { cursor, numItems: 100 },
      });
    // The endpoint reads only the requested table; the generated union does not retain that relationship.
    rows.push(...(result.page as unknown as Doc<T>[]));
    cursor = result.isDone ? null : result.continueCursor;
  } while (cursor);
  return rows;
}
