import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
export const current = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("billing")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .unique();
  },
});
export const authorize = mutation({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "billing", 10);
    return { id: a._id };
  },
});
export const attachCustomer = internalMutation({
  args: { athleteId: v.id("athletes"), customerId: v.string() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.athleteId);
    if (!a || a.status !== "active")
      throw new ConvexError("Account unavailable.");
    const old = await ctx.db
      .query("billing")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .unique();
    if (old) return old.customerId;
    await ctx.db.insert("billing", {
      ...args,
      status: "free",
      updatedAt: Date.now(),
    });
    return args.customerId;
  },
});
export const byCustomer = internalQuery({
  args: { customerId: v.string() },
  handler: (ctx, { customerId }) =>
    ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .unique(),
});
export const apply = internalMutation({
  args: {
    eventId: v.string(),
    customerId: v.string(),
    subscriptionId: v.string(),
    status: v.string(),
    periodEnd: v.number(),
    observedAt: v.number(),
  },
  handler: async (ctx, args) => {
    if (
      await ctx.db
        .query("webhookEvents")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .unique()
    )
      return;
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();
    if (!row)
      throw new ConvexError("Billing account unavailable. Retry delivery.");
    if (args.observedAt >= row.updatedAt) {
      await ctx.db.patch(row._id, {
        subscriptionId: args.subscriptionId,
        status: args.status,
        periodEnd: args.periodEnd,
        updatedAt: args.observedAt,
      });
      await ctx.db.insert("auditEvents", {
        athleteId: row.athleteId,
        action: "subscription_changed",
        at: Date.now(),
      });
    }
    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      at: Date.now(),
    });
  },
});
