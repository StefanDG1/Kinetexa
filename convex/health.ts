import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { requireAthlete } from "./athletes";
import { HEALTH_METRICS } from "../packages/core/health";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { z } from "zod";
const date = z.iso.date();
export async function currentHealth(ctx: QueryCtx, row: Doc<"health">) {
  if (!row.sourceId) return row.generation === undefined;
  const source = await ctx.db.get(row.sourceId);
  return (
    source?.athleteId === row.athleteId &&
    (row.generation ?? 0) === (source.healthGeneration ?? 0)
  );
}
export async function visibleHealth(ctx: QueryCtx, rows: Doc<"health">[]) {
  const visible = await Promise.all(rows.map((row) => currentHealth(ctx, row)));
  return rows.filter((_, i) => visible[i]);
}
export const status = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx),
      source = await ctx.db
        .query("sources")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .first();
    const available = await Promise.all(
      Object.keys(HEALTH_METRICS).map(async (kind) => {
        for await (const row of ctx.db
          .query("health")
          .withIndex("by_kind", (q) =>
            q.eq("athleteId", a._id).eq("kind", kind),
          ))
          if (await currentHealth(ctx, row)) return { kind, available: true };
        return { kind, available: false };
      }),
    );
    return {
      enabled: a.healthProcessing !== false,
      hasSource: Boolean(source),
      available,
    };
  },
});
export const page = query({
  args: {
    from: v.string(),
    to: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    if (
      !date.safeParse(args.from).success ||
      !date.safeParse(args.to).success ||
      args.from > args.to
    )
      throw new ConvexError("Choose a valid date range.");
    const result = await ctx.db
      .query("health")
      .withIndex("by_athlete", (q) =>
        q.eq("athleteId", a._id).gte("date", args.from).lte("date", args.to),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
        maximumBytesRead: 4 * 1024 * 1024,
      });
    return { ...result, page: await visibleHealth(ctx, result.page) };
  },
});
export const setProcessing = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, { enabled }) => {
    const a = await requireAthlete(ctx);
    await ctx.db.patch(a._id, {
      healthProcessing: enabled,
      healthProcessingRevision: (a.healthProcessingRevision ?? 0) + 1,
    });
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: enabled
        ? "health_processing_enabled"
        : "health_processing_disabled",
      at: Date.now(),
    });
  },
});
