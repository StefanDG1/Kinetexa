import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
export const enqueue = internalMutation({
  args: {
    athleteId: v.id("athletes"),
    template: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("outbox")
        .withIndex("by_key", (q) => q.eq("dedupeKey", args.dedupeKey))
        .unique()
    )
      return;
    const id = await ctx.db.insert("outbox", {
      ...args,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.emailActions.send, { id });
  },
});
export const claim = internalMutation({
  args: { id: v.id("outbox") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || !["queued", "retrying"].includes(row.status)) return null;
    const a = await ctx.db.get(row.athleteId);
    if (!a || a.status !== "active") return null;
    const key = "resend-" + new Date().toISOString().slice(0, 10),
      counter = await ctx.db
        .query("systemCounters")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
    if ((counter?.count ?? 0) >= 90) {
      await ctx.db.patch(id, { status: "retrying" });
      await ctx.scheduler.runAfter(86400000, internal.emailActions.send, {
        id,
      });
      return null;
    }
    if (counter) await ctx.db.patch(counter._id, { count: counter.count + 1 });
    else await ctx.db.insert("systemCounters", { key, count: 1 });
    await ctx.db.patch(id, { status: "sending", attempts: row.attempts + 1 });
    return { row, userId: a.workosUserId };
  },
});
export const result = internalMutation({
  args: {
    id: v.id("outbox"),
    providerId: v.optional(v.string()),
    failed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row) return;
    const retry = args.failed && row.attempts < 4;
    await ctx.db.patch(row._id, {
      status: retry ? "retrying" : args.failed ? "failed" : "sent",
      providerId: args.providerId,
    });
    if (retry)
      await ctx.scheduler.runAfter(
        30000 * 2 ** row.attempts,
        internal.emailActions.send,
        { id: row._id },
      );
  },
});
export const delivery = internalMutation({
  args: { providerId: v.string(), status: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("outbox")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .unique();
    if (row) await ctx.db.patch(row._id, { status: args.status });
  },
});
