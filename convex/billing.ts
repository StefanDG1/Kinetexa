import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import { internal } from "./_generated/api";
import { hasPremium, needsBillingPortal } from "../packages/core/entitlements";
export const current = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    const row = await ctx.db
      .query("billing")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .unique();
    if (!row) return null;
    const { checkout, ...publicRow } = row;
    return {
      ...publicRow,
      premium: hasPremium(row),
      checkoutPending: Boolean(checkout && checkout.expiresAt > Date.now()),
    };
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
export const hasEvent = internalQuery({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) =>
    Boolean(
      await ctx.db
        .query("webhookEvents")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .unique(),
    ),
});
export const apply = internalMutation({
  args: {
    eventId: v.string(),
    customerId: v.string(),
    subscriptionId: v.string(),
    status: v.string(),
    periodEnd: v.number(),
    observedAt: v.number(),
    revision: v.optional(v.number()),
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
    if (
      args.observedAt >= row.updatedAt &&
      (args.revision === undefined || args.revision === row.refreshRevision)
    ) {
      await ctx.db.patch(row._id, {
        subscriptionId: args.subscriptionId,
        status: args.status,
        periodEnd: args.periodEnd,
        updatedAt: args.observedAt,
      });
      if (
        args.periodEnd > Date.now() &&
        ["active", "trialing"].includes(args.status) &&
        args.periodEnd !== row.periodEnd
      )
        await ctx.scheduler.runAt(
          args.periodEnd + 1000,
          internal.billingActions.refresh,
          { customerId: args.customerId },
        );
      if (
        row.status !== args.status ||
        row.subscriptionId !== args.subscriptionId ||
        row.periodEnd !== args.periodEnd
      )
        await ctx.db.insert("auditEvents", {
          athleteId: row.athleteId,
          action: "subscription_changed",
          at: Date.now(),
        });
      if (row.status !== args.status)
        await ctx.scheduler.runAfter(0, internal.email.enqueue, {
          athleteId: row.athleteId,
          template: "billing",
          dedupeKey: `billing-${args.eventId}`,
        });
    }
    await ctx.db.insert("webhookEvents", {
      eventId: args.eventId,
      at: Date.now(),
    });
  },
});

export const reserveCheckout = internalMutation({
  args: {
    athleteId: v.id("athletes"),
    key: v.string(),
    interval: v.union(v.literal("monthly"), v.literal("annual")),
    price: v.string(),
    appUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.athleteId);
    if (!a || a.status !== "active")
      throw new ConvexError("Account unavailable.");
    const row = await ctx.db
      .query("billing")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .unique();
    if (!row) throw new ConvexError("Billing unavailable.");
    if (needsBillingPortal(row.status))
      throw new ConvexError(
        "Manage your existing subscription in the billing portal.",
      );
    if (row.checkout && row.checkout.expiresAt > Date.now()) {
      if (row.checkout.interval !== args.interval)
        throw new ConvexError(
          "Close your pending checkout before choosing a different plan.",
        );
      return { customerId: row.customerId, ...row.checkout };
    }
    const checkout = {
      key: args.key,
      interval: args.interval,
      price: args.price,
      appUrl: args.appUrl,
      expiresAt: Math.floor(Date.now() / 1000) * 1000 + 3600000,
    };
    await ctx.db.patch(row._id, { checkout });
    return {
      customerId: row.customerId,
      ...checkout,
      sessionId: undefined as string | undefined,
    };
  },
});
export const rememberCheckout = internalMutation({
  args: { customerId: v.string(), key: v.string(), sessionId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();
    if (!row?.checkout || row.checkout.key !== args.key) return false;
    const a = await ctx.db.get(row.athleteId);
    if (!a || a.status !== "active") return false;
    await ctx.db.patch(row._id, {
      checkout: { ...row.checkout, sessionId: args.sessionId },
    });
    return true;
  },
});
export const clearCheckout = internalMutation({
  args: { customerId: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();
    if (row?.checkout?.key === args.key)
      await ctx.db.patch(row._id, { checkout: undefined });
  },
});
export const beginRefresh = internalMutation({
  args: { customerId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("billing")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .unique();
    if (!row) throw new ConvexError("Billing customer is not linked yet.");
    const revision = (row.refreshRevision ?? 0) + 1;
    await ctx.db.patch(row._id, { refreshRevision: revision });
    return revision;
  },
});
export const reconcilePage = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("billing")
      .paginate({ cursor: cursor ?? null, numItems: 50 });
    for (const row of page.page) {
      const a = await ctx.db.get(row.athleteId);
      if (a?.status === "active")
        await ctx.scheduler.runAfter(0, internal.billingActions.refresh, {
          customerId: row.customerId,
        });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(1000, internal.billing.reconcilePage, {
        cursor: page.continueCursor,
      });
  },
});
