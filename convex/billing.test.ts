/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { hasPremium } from "../packages/core/entitlements";
import Stripe from "stripe";
const modules = import.meta.glob("./**/*.ts");
const provider = vi.hoisted(() => ({
  subscriptions: [] as any[],
  sessions: [] as any[],
  requests: [] as any[],
  keys: new Map<string, { body: string; session: any }>(),
}));
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  return {
    default: class {
      webhooks = new actual.default("sk_test_synthetic").webhooks;
      customers = { create: async () => ({ id: "cus_test" }) };
      subscriptions = {
        list: () => ({
          async *[Symbol.asyncIterator]() {
            for (const sub of provider.subscriptions) yield sub;
          },
        }),
        cancel: async (id: string) => {
          const sub = provider.subscriptions.find((s) => s.id === id);
          sub.status = "canceled";
          return sub;
        },
      };
      checkout = {
        sessions: {
          list: ({ status }: { status?: string }) => ({
            async *[Symbol.asyncIterator]() {
              for (const session of provider.sessions)
                if (!status || session.status === status) yield session;
            },
          }),
          retrieve: async (id: string) =>
            provider.sessions.find((s) => s.id === id),
          create: async (body: any, opts: any) => {
            provider.requests.push({ body, key: opts.idempotencyKey });
            const old = provider.keys.get(opts.idempotencyKey);
            if (old) {
              if (old.body !== JSON.stringify(body))
                throw Error("Stripe idempotency parameter mismatch");
              return old.session;
            }
            const session = {
              id: `cs_${provider.sessions.length}`,
              url: "https://checkout.stripe.test/synthetic",
              status: "open",
              metadata: body.metadata,
            };
            provider.sessions.push(session);
            provider.keys.set(opts.idempotencyKey, {
              body: JSON.stringify(body),
              session,
            });
            return session;
          },
          expire: async (id: string) => {
            const session = provider.sessions.find((s) => s.id === id);
            session.status = "expired";
            return session;
          },
        },
      };
    },
  };
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  provider.subscriptions = [];
  provider.sessions = [];
  provider.requests = [];
  provider.keys.clear();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic");
  vi.stubEnv("STRIPE_PREMIUM_MONTHLY_PRICE_ID", "price_monthly");
  vi.stubEnv("STRIPE_PREMIUM_ANNUAL_PRICE_ID", "price_annual");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.invalid");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
async function setup() {
  const t = convexTest(schema, modules),
    a = t.withIdentity({ subject: "billing-owner" }),
    b = t.withIdentity({ subject: "billing-other" });
  const athleteId = await a.mutation(api.athletes.ensure);
  await b.mutation(api.athletes.ensure);
  await t.mutation(internal.billing.attachCustomer, {
    athleteId,
    customerId: "cus_test",
  });
  return { t, a, b, athleteId };
}
it("reuses concurrent checkout attempts, rejects conflicting plans and expires the old session before changing plans", async () => {
  const { a, b } = await setup();
  const urls = await Promise.all([
    a.action(api.billingActions.checkout, { interval: "monthly" }),
    a.action(api.billingActions.checkout, { interval: "monthly" }),
  ]);
  expect(urls[0]).toBe(urls[1]);
  expect(provider.sessions).toHaveLength(1);
  expect(new Set(provider.requests.map((r) => r.key)).size).toBe(1);
  expect(
    new Set(provider.requests.map((r) => JSON.stringify(r.body))).size,
  ).toBe(1);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://changed.invalid");
  await a.action(api.billingActions.checkout, { interval: "monthly" });
  expect(provider.sessions).toHaveLength(1);
  await expect(
    a.action(api.billingActions.checkout, { interval: "annual" }),
  ).rejects.toThrow("pending checkout");
  await b.action(api.billingActions.cancelCheckout, {});
  expect(provider.sessions[0].status).toBe("open");
  await a.action(api.billingActions.cancelCheckout, {});
  expect(provider.sessions[0].status).toBe("expired");
  await a.action(api.billingActions.checkout, { interval: "annual" });
  expect(provider.sessions.filter((s) => s.status === "open")).toHaveLength(1);
  expect(provider.requests.at(-1).body.line_items[0].price).toBe(
    "price_annual",
  );
});
it("ignores stale subscription refreshes and expires premium independently of webhook delivery", async () => {
  const { t, a, b, athleteId } = await setup();
  const first = await t.mutation(internal.billing.beginRefresh, {
    customerId: "cus_test",
  });
  const second = await t.mutation(internal.billing.beginRefresh, {
    customerId: "cus_test",
  });
  const state = {
    customerId: "cus_test",
    subscriptionId: "sub_test",
    periodEnd: Date.now() + 1000,
    observedAt: Date.now(),
  };
  await t.mutation(internal.billing.apply, {
    ...state,
    eventId: "new",
    status: "canceled",
    revision: second,
  });
  await t.mutation(internal.billing.apply, {
    ...state,
    eventId: "old",
    status: "active",
    revision: first,
  });
  expect((await a.query(api.billing.current))?.premium).toBe(false);
  const revision = await t.mutation(internal.billing.beginRefresh, {
    customerId: "cus_test",
  });
  await t.mutation(internal.billing.apply, {
    ...state,
    eventId: "active",
    status: "active",
    revision,
  });
  expect((await a.query(api.billing.current))?.premium).toBe(true);
  vi.setSystemTime(Date.now() + 1000);
  expect((await a.query(api.billing.current))?.premium).toBe(false);
  expect(hasPremium({ status: "active" })).toBe(false);
  expect(
    hasPremium({ status: "past_due", periodEnd: Date.now() + 10000 }),
  ).toBe(false);
  expect(await b.query(api.billing.current)).toBeNull();
  await t.run((ctx) => ctx.db.patch(athleteId, { status: "deleting" }));
  await expect(
    t.mutation(internal.billing.reserveCheckout, {
      athleteId,
      key: "blocked",
      interval: "monthly",
      price: "price_monthly",
      appUrl: "https://example.invalid",
    }),
  ).rejects.toThrow("Account unavailable");
});
it("reconciles all subscription pages and closes open checkouts plus every live premium subscription during deletion", async () => {
  const { a } = await setup();
  provider.subscriptions = Array.from({ length: 101 }, (_, i) => ({
    id: `sub_old_${i}`,
    created: i,
    status: "canceled",
    items: {
      data: [{ price: { id: "price_monthly" }, current_period_end: 1 }],
    },
  }));
  provider.subscriptions.push({
    id: "sub_live",
    created: 200,
    status: "active",
    items: {
      data: [
        {
          price: { id: "price_monthly" },
          current_period_end: Date.now() / 1000 + 3600,
        },
      ],
    },
  });
  await a.action(api.billingActions.refreshCurrent, {});
  expect((await a.query(api.billing.current))?.premium).toBe(true);
  await expect(
    a.action(api.billingActions.checkout, { interval: "monthly" }),
  ).rejects.toThrow("billing portal");
  provider.sessions.push({ id: "cs_unfinished", status: "open" });
  const { closeCustomerBilling } = await import("./billingActions");
  await closeCustomerBilling("cus_test");
  expect(provider.sessions[0].status).toBe("expired");
  expect(provider.subscriptions.every((s) => s.status === "canceled")).toBe(
    true,
  );
});

it("rejects forged and wrong-environment webhooks, deduplicates replay and reads current provider state for old events", async () => {
  const { t, a } = await setup();
  const secret = "whsec_synthetic_only";
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  provider.subscriptions.push({
    id: "sub_current",
    created: 1,
    status: "past_due",
    items: {
      data: [
        {
          price: { id: "price_monthly" },
          current_period_end: Date.now() / 1000 + 3600,
        },
      ],
    },
  });
  const signed = (id: string, livemode = false) => {
    const body = JSON.stringify({
      id,
      livemode,
      type: "customer.subscription.updated",
      data: { object: { customer: "cus_test", status: "active" } },
    });
    return {
      body,
      signature: new Stripe(
        "sk_test_synthetic",
      ).webhooks.generateTestHeaderString({
        payload: body,
        secret,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    };
  };
  await expect(
    t.action(internal.billingActions.webhook, {
      body: "{}",
      signature: "forged",
    }),
  ).rejects.toThrow();
  await expect(
    t.action(internal.billingActions.webhook, signed("live", true)),
  ).rejects.toThrow("environment mismatch");
  await t.action(internal.billingActions.webhook, signed("old-active-event"));
  expect((await a.query(api.billing.current))?.status).toBe("past_due");
  expect((await a.query(api.billing.current))?.premium).toBe(false);
  const revision = (
    await t.query(internal.billing.byCustomer, { customerId: "cus_test" })
  )?.refreshRevision;
  await t.action(internal.billingActions.webhook, signed("old-active-event"));
  expect(
    (await t.query(internal.billing.byCustomer, { customerId: "cus_test" }))
      ?.refreshRevision,
  ).toBe(revision);
});
