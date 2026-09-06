"use node";
import Stripe from "stripe";
import { randomBytes } from "node:crypto";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
export const catalog = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<
    { interval: "monthly" | "annual"; amount: number; currency: string }[]
  > => {
    await ctx.runQuery(api.billing.current, {});
    return Promise.all(
      (["monthly", "annual"] as const).map(async (interval) => {
        const price = await stripeClient().prices.retrieve(
          process.env[
            interval === "monthly"
              ? "STRIPE_PREMIUM_MONTHLY_PRICE_ID"
              : "STRIPE_PREMIUM_ANNUAL_PRICE_ID"
          ]!,
        );
        if (!price.active || price.unit_amount === null || !price.recurring)
          throw new ConvexError("Pricing is temporarily unavailable.");
        return {
          interval,
          amount: price.unit_amount / 100,
          currency: price.currency,
        };
      }),
    );
  },
});
export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Billing is not configured.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export const checkout = action({
  args: { interval: v.union(v.literal("monthly"), v.literal("annual")) },
  handler: async (ctx, { interval }): Promise<string> => {
    const { id } = await ctx.runMutation(api.billing.authorize, {}),
      existing = await ctx.runQuery(api.billing.current, {}),
      stripe = stripeClient();
    if (
      existing &&
      ["active", "trialing", "past_due"].includes(existing.status)
    )
      throw new ConvexError(
        "Manage your existing subscription in the billing portal.",
      );
    const customerId =
      existing?.customerId ??
      (await ctx.runMutation(internal.billing.attachCustomer, {
        athleteId: id,
        customerId: (
          await stripe.customers.create(
            { metadata: { athleteId: id } },
            { idempotencyKey: `customer-${id}` },
          )
        ).id,
      }));
    const price =
      process.env[
        interval === "monthly"
          ? "STRIPE_PREMIUM_MONTHLY_PRICE_ID"
          : "STRIPE_PREMIUM_ANNUAL_PRICE_ID"
      ];
    if (!price) throw new ConvexError("This plan is not configured.");
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?checkout=success`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
        client_reference_id: id,
        subscription_data: { metadata: { athleteId: id } },
        integration_identifier: `kinetexa-${randomBytes(4).toString("hex").replace(/[0-9]/g, "a")}`,
      },
      {
        idempotencyKey: `checkout-${id}-${interval}-${Math.floor(Date.now() / 300000)}`,
      },
    );
    if (!session.url) throw new ConvexError("Checkout is unavailable.");
    return session.url;
  },
});
export const portal = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    await ctx.runMutation(api.billing.authorize, {});
    const row = await ctx.runQuery(api.billing.current, {});
    if (!row) throw new ConvexError("No billing account yet.");
    return (
      await stripeClient().billingPortal.sessions.create({
        customer: row.customerId,
        configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
      })
    ).url;
  },
});
export const webhook = internalAction({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, args) => {
    const stripe = stripeClient(),
      secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Webhook unavailable.");
    const event = stripe.webhooks.constructEvent(
      args.body,
      args.signature,
      secret,
      300,
    );
    if (
      event.livemode !==
      Boolean(process.env.STRIPE_SECRET_KEY?.includes("_live_"))
    )
      throw new Error("Payment environment mismatch.");
    if (
      !event.type.startsWith("customer.subscription.") &&
      !event.type.startsWith("invoice.") &&
      event.type !== "checkout.session.completed"
    )
      return;
    const object = event.data.object as any,
      customerId =
        typeof object.customer === "string"
          ? object.customer
          : object.customer?.id;
    if (!customerId) return;
    const row = await ctx.runQuery(internal.billing.byCustomer, { customerId });
    if (!row) throw new Error("Billing customer is not linked yet.");
    const observedAt = Date.now();
    // Read current Stripe state on every delivery; out-of-order events cannot restore stale access.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const prices = new Set([
      process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
      process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
    ]);
    const matching = subscriptions.data.filter((s) =>
      s.items.data.some((i) => prices.has(i.price.id)),
    );
    const sub =
      matching.find((s) => ["active", "trialing"].includes(s.status)) ??
      matching.sort((a, b) => b.created - a.created)[0];
    await ctx.runMutation(internal.billing.apply, {
      eventId: event.id,
      customerId,
      subscriptionId: sub?.id ?? "",
      status: sub?.status ?? "free",
      periodEnd: (sub?.items.data[0]?.current_period_end ?? 0) * 1000,
      observedAt,
    });
  },
});
