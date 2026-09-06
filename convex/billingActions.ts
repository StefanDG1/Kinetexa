"use node";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { observeWebhook } from "./webhookObservation";
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
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 15000,
    maxNetworkRetries: 2,
  });
}
export const checkout = action({
  args: { interval: v.union(v.literal("monthly"), v.literal("annual")) },
  handler: async (ctx, { interval }): Promise<string> => {
    const { id } = await ctx.runMutation(api.billing.authorize, {}),
      existing = await ctx.runQuery(api.billing.current, {}),
      stripe = stripeClient();
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
    if (!process.env.NEXT_PUBLIC_APP_URL)
      throw new ConvexError("Billing is not configured.");
    await refreshCustomer(ctx, customerId);
    const reserved = await ctx.runMutation(internal.billing.reserveCheckout, {
      athleteId: id,
      key: `checkout-${randomUUID()}`,
      interval,
      price,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });
    let session = await findCheckout(stripe, reserved);
    if (!session && reserved.expiresAt - Date.now() < 31 * 60000)
      throw new ConvexError(
        "This checkout attempt is being reconciled. Retry after its one-hour reservation expires.",
      );
    session ??= await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: reserved.price, quantity: 1 }],
        success_url: `${reserved.appUrl}/billing?checkout=success`,
        cancel_url: `${reserved.appUrl}/billing`,
        client_reference_id: id,
        subscription_data: { metadata: { athleteId: id } },
        metadata: { reservation: reserved.key },
        expires_at: reserved.expiresAt / 1000,
        integration_identifier: "kinetexa",
      },
      {
        idempotencyKey: reserved.key,
      },
    );
    if (session.status !== "open" || !session.url) {
      await refreshCustomer(ctx, customerId);
      if (session.status === "expired")
        await ctx.runMutation(internal.billing.clearCheckout, {
          customerId,
          key: reserved.key,
        });
      throw new ConvexError(
        session.status === "complete"
          ? "Checkout completed. Refresh your subscription status."
          : "Checkout expired. Choose your plan again.",
      );
    }
    const attached = await ctx.runMutation(internal.billing.rememberCheckout, {
      customerId,
      key: reserved.key,
      sessionId: session.id,
    });
    if (!attached) {
      await stripe.checkout.sessions.expire(session.id);
      throw new ConvexError("Checkout is no longer available.");
    }
    return session.url;
  },
});

async function findCheckout(
  stripe: Stripe,
  reservation: { customerId: string; key: string; sessionId?: string },
) {
  if (reservation.sessionId)
    return stripe.checkout.sessions.retrieve(reservation.sessionId);
  for await (const session of stripe.checkout.sessions.list({
    customer: reservation.customerId,
    limit: 100,
  }))
    if (session.metadata?.reservation === reservation.key) return session;
  return null;
}

export const cancelCheckout = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    await ctx.runMutation(api.billing.authorize, {});
    const owned = await ctx.runQuery(api.billing.current, {});
    if (!owned) return;
    const row = await ctx.runQuery(internal.billing.byCustomer, {
      customerId: owned.customerId,
    });
    if (!row?.checkout) return;
    const stripe = stripeClient(),
      session = await findCheckout(stripe, {
        customerId: row.customerId,
        ...row.checkout,
      });
    if (session?.status === "open")
      await stripe.checkout.sessions.expire(session.id);
    if (!session && row.checkout.expiresAt > Date.now())
      throw new ConvexError(
        "Checkout creation has not settled. Retry shortly, or wait for its one-hour reservation to expire.",
      );
    await refreshCustomer(ctx, row.customerId);
    await ctx.runMutation(internal.billing.clearCheckout, {
      customerId: row.customerId,
      key: row.checkout.key,
    });
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
    const startedAt = Date.now();
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
    await observeWebhook(
      ctx,
      {
        service: "stripe",
        eventId: event.id,
        startedAt,
        bytes: Buffer.byteLength(args.body),
      },
      async () => {
        if (
          !event.type.startsWith("customer.subscription.") &&
          !event.type.startsWith("invoice.") &&
          event.type !== "checkout.session.completed"
        )
          return "ignored";
        const object = event.data.object as any,
          customerId =
            typeof object.customer === "string"
              ? object.customer
              : object.customer?.id;
        if (!customerId) return "ignored";
        if (
          await ctx.runQuery(internal.billing.hasEvent, { eventId: event.id })
        )
          return "duplicate";
        if (!(await ctx.runQuery(internal.billing.byCustomer, { customerId })))
          return "ignored";
        await refreshCustomer(ctx, customerId, event.id);
        return "accepted";
      },
    );
  },
});

async function refreshCustomer(
  ctx: ActionCtx,
  customerId: string,
  eventId = `reconcile-${randomUUID()}`,
) {
  const revision = await ctx.runMutation(internal.billing.beginRefresh, {
    customerId,
  });
  const observedAt = Date.now(),
    stripe = stripeClient();
  const prices = new Set([
    process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
  ]);
  const matching: Stripe.Subscription[] = [];
  for await (const subscription of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  }))
    if (subscription.items.data.some((i) => prices.has(i.price.id)))
      matching.push(subscription);
  const periodEnd = (s: Stripe.Subscription) =>
    Math.max(
      0,
      ...s.items.data
        .filter((i) => prices.has(i.price.id))
        .map((i) => i.current_period_end * 1000),
    );
  matching.sort((a, b) => b.created - a.created);
  const sub =
    matching
      .filter((s) => ["active", "trialing"].includes(s.status))
      .sort((a, b) => periodEnd(b) - periodEnd(a))[0] ?? matching[0];
  await ctx.runMutation(internal.billing.apply, {
    eventId,
    customerId,
    subscriptionId: sub?.id ?? "",
    status: sub?.status ?? "free",
    periodEnd: sub ? periodEnd(sub) : 0,
    observedAt,
    revision,
  });
}

export const refresh = internalAction({
  args: { customerId: v.string() },
  handler: async (ctx, { customerId }) => {
    if (!(await ctx.runQuery(internal.billing.byCustomer, { customerId })))
      return;
    await refreshCustomer(ctx, customerId);
  },
});

export const refreshCurrent = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    await ctx.runMutation(api.billing.authorize, {});
    const row = await ctx.runQuery(api.billing.current, {});
    if (row) await refreshCustomer(ctx, row.customerId);
  },
});

export async function closeCustomerBilling(customerId: string) {
  const stripe = stripeClient();
  for await (const session of stripe.checkout.sessions.list({
    customer: customerId,
    status: "open",
    limit: 100,
  }))
    await stripe.checkout.sessions.expire(session.id);
  const prices = new Set([
    process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID,
    process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID,
  ]);
  for await (const sub of stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  }))
    if (
      !["canceled", "incomplete_expired"].includes(sub.status) &&
      sub.items.data.some((i) => prices.has(i.price.id))
    )
      await stripe.subscriptions.cancel(sub.id);
}
