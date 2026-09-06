import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
export async function rateLimit(
  ctx: MutationCtx,
  athleteId: Id<"athletes">,
  kind: string,
  limit: number,
  windowMs = 3600000,
) {
  const window = String(Math.floor(Date.now() / windowMs));
  const row = await ctx.db
    .query("usage")
    .withIndex("by_athlete", (q) =>
      q.eq("athleteId", athleteId).eq("kind", kind).eq("window", window),
    )
    .unique();
  if ((row?.count ?? 0) >= limit)
    throw new ConvexError(
      "Usage limit reached. Try again after this window resets.",
    );
  if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
  else await ctx.db.insert("usage", { athleteId, kind, window, count: 1 });
}
