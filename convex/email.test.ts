/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { Webhook } from "svix";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.stubEnv("KINETEXA_ENVIRONMENT", "development");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T10:00:00Z"));
});
it("reserves a shared Free-tier allowance across environments and defers excess work without consuming an attempt", async () => {
  const { dailyEmailAllowance } = await import("./email");
  expect(
    ["production", "staging", "development"].reduce(
      (sum, environment) => sum + dailyEmailAllowance(environment),
      0,
    ),
  ).toBe(90);
  expect(dailyEmailAllowance("restore")).toBe(0);
  expect(dailyEmailAllowance(undefined)).toBe(0);
  const { t, athleteId, id } = await setup("quota");
  await t.run((ctx) =>
    ctx.db.insert("systemCounters", { key: "resend-2026-09-06", count: 4 }),
  );
  const next = (await t.mutation(internal.email.enqueue, {
    athleteId,
    template: "export",
    dedupeKey: "quota-next",
  }))!;
  expect(await t.mutation(internal.email.claim, { id })).not.toBeNull();
  expect(await t.mutation(internal.email.claim, { id: next })).toBeNull();
  expect(await t.run((ctx) => ctx.db.get(next))).toMatchObject({
    status: "retrying",
    attempts: 0,
  });
  vi.setSystemTime(new Date("2026-09-07T00:01:00Z"));
  expect(await t.mutation(internal.email.claim, { id: next })).not.toBeNull();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup(key: string) {
  const t = convexTest(schema, modules),
    a = t.withIdentity({ subject: "email-owner" }),
    b = t.withIdentity({ subject: "email-other" });
  const athleteId = await a.mutation(api.athletes.ensure);
  await b.mutation(api.athletes.ensure);
  const id = (await t.mutation(internal.email.enqueue, {
    athleteId,
    template: "export",
    dedupeKey: key,
  }))!;
  return { t, a, b, athleteId, id };
}
it("recovers interrupted sends, fences stale completions and stops uncertain retries before the provider forgets their key", async () => {
  const { t, id } = await setup("interrupted");
  const first = (await t.mutation(internal.email.claim, { id }))!;
  await t.mutation(internal.email.watchdog, { id, attempt: first.attempt });
  const second = (await t.mutation(internal.email.claim, { id }))!;
  await t.mutation(internal.email.result, {
    id,
    attempt: first.attempt,
    failed: false,
    providerId: "stale",
  });
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("sending");
  await t.mutation(internal.email.watchdog, { id, attempt: second.attempt });
  vi.setSystemTime(Date.now() + 23 * 3600000);
  expect(await t.mutation(internal.email.claim, { id })).toBeNull();
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe(
    "delivery-unknown",
  );
});
it("persists early signed delivery events, ignores replay order and suppresses future mail after a bounce", async () => {
  const { t, a, b, athleteId, id } = await setup("webhook-race");
  const secret =
    "whsec_" +
    Buffer.from("synthetic-webhook-test-key-only").toString("base64");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", secret);
  const sign = (type: string, at: number, eventId: string) => {
    const body = JSON.stringify({
      type,
      created_at: new Date(at).toISOString(),
      data: { email_id: "provider-1" },
    });
    return {
      body,
      headers: {
        "svix-id": eventId,
        "svix-timestamp": String(Math.floor(Date.now() / 1000)),
        "svix-signature": new Webhook(secret).sign(eventId, new Date(), body),
      },
    };
  };
  await expect(
    t.action(internal.emailActions.webhook, { body: "{}", headers: {} }),
  ).rejects.toThrow();
  await t.action(
    internal.emailActions.webhook,
    sign("email.delivered", Date.now(), "event-delivered"),
  );
  const claimed = (await t.mutation(internal.email.claim, { id }))!;
  await t.mutation(internal.email.result, {
    id,
    attempt: claimed.attempt,
    failed: false,
    providerId: "provider-1",
  });
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("delivered");
  await t.action(
    internal.emailActions.webhook,
    sign("email.failed", Date.now() - 1000, "event-old"),
  );
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("delivered");
  await t.action(
    internal.emailActions.webhook,
    sign("email.bounced", Date.now() + 1000, "event-bounced"),
  );
  await t.action(
    internal.emailActions.webhook,
    sign("email.delivered", Date.now() + 2000, "event-delivered-again"),
  );
  expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("bounced");
  expect((await a.query(api.athletes.current))?.emailSuppressed).toBe(
    "bounced",
  );
  const next = (await t.mutation(internal.email.enqueue, {
    athleteId,
    template: "import",
    dedupeKey: "after-bounce",
  }))!;
  expect(await t.mutation(internal.email.claim, { id: next })).toBeNull();
  expect(
    (
      await b.query(api.email.page, {
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page,
  ).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.query("emailEvents").collect()),
  ).toHaveLength(1);
});
it("retries with identical payload and key, then removes the cached recipient after acceptance", async () => {
  const { t, id } = await setup("payload-retry");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "test@example.invalid");
  vi.stubEnv("WORKOS_API_KEY", "synthetic-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://example.invalid");
  const sent: { body: string; key: string }[] = [];
  let lookups = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("workos")) {
        lookups++;
        return new Response(
          JSON.stringify({ email: "synthetic@example.invalid" }),
        );
      }
      sent.push({
        body: String(init.body),
        key: new Headers(init.headers).get("Idempotency-Key")!,
      });
      return sent.length === 1
        ? new Response("temporary", { status: 503 })
        : new Response(JSON.stringify({ id: "provider-retry" }));
    }),
  );
  await t.action(internal.emailActions.send, { id });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://changed.example.invalid");
  await t.action(internal.emailActions.send, { id });
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(lookups).toBe(1);
  expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
    status: "sent",
    providerId: "provider-retry",
  });
  expect((await t.run((ctx) => ctx.db.get(id)))?.payload).toBeUndefined();
});
