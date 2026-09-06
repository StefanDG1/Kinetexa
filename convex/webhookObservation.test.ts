/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import Stripe from "stripe";
import { Webhook } from "svix";
import schema from "./schema";
import { internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("observes only verified webhook outcomes, distinguishes retries and isolates provider failure alerts", async () => {
  vi.useFakeTimers();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_unit_fixture");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_unit_fixture");
  vi.stubEnv(
    "RESEND_WEBHOOK_SECRET",
    "whsec_" + btoa("unit-fixture-signing-material"),
  );
  try {
    const t = convexTest(schema, modules),
      stripe = new Stripe("sk_test_unit_fixture");
    const body = JSON.stringify({
      id: "evt_unknown_customer",
      type: "invoice.paid",
      livemode: false,
      data: {
        object: { customer: "cus_unrelated", privateNote: "never-record-this" },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: "whsec_unit_fixture",
      timestamp: Math.floor(Date.now() / 1000),
    });
    await expect(
      t.action(internal.billingActions.webhook, { body, signature: "forged" }),
    ).rejects.toThrow();
    expect(
      await t.run((ctx) => ctx.db.query("operationalEvents").collect()),
    ).toEqual([]);
    await t.action(internal.billingActions.webhook, { body, signature });
    const webhook = new Webhook(process.env.RESEND_WEBHOOK_SECRET!);
    const deliver = async (id: string, created_at: string) => {
      const body = JSON.stringify({
          type: "email.delivered",
          created_at,
          data: { email_id: "fixture-email", privateNote: "never-record-this" },
        }),
        at = new Date();
      return t.action(internal.emailActions.webhook, {
        body,
        headers: {
          "svix-id": id,
          "svix-timestamp": Math.floor(at.getTime() / 1000).toString(),
          "svix-signature": webhook.sign(id, at, body),
        },
      });
    };
    await deliver("msg_delivered", new Date().toISOString());
    await deliver("msg_delivered", new Date().toISOString());
    for (let i = 0; i < 5; i++)
      await expect(deliver(`msg_invalid_${i}`, "invalid-date")).rejects.toThrow(
        "Invalid email event time",
      );
    // Repeating the same failed event must not inflate logical event outcome counts.
    await expect(deliver("msg_invalid_0", "invalid-date")).rejects.toThrow();
    const events = await t.run((ctx) =>
      ctx.db.query("operationalEvents").collect(),
    );
    expect(events).toHaveLength(8);
    expect(JSON.stringify(events)).not.toContain("never-record-this");
    expect(JSON.stringify(events)).not.toContain(signature);
    const result = await t.action(internal.operations.check, {});
    expect(result.metrics["webhook:stripe"]).toMatchObject({
      events: 1,
      failures: 0,
      outcomes: { ignored: 1 },
    });
    expect(result.metrics["webhook:resend"]).toMatchObject({
      events: 7,
      failures: 5,
      outcomes: { accepted: 1, duplicate: 1, failed: 5 },
    });
    expect(result.alerts).toContain("webhook:resend-failure-rate");
    expect(result.alerts).not.toContain("webhook:stripe-failure-rate");
  } finally {
    vi.unstubAllEnvs();
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
