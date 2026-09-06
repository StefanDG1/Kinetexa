/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("KINETEXA_ENVIRONMENT", "staging");
  vi.stubEnv("KINETEXA_TELEMETRY_ENABLED", "true");
  vi.stubEnv("POSTHOG_PROJECT_TOKEN", "synthetic-project-token");
  vi.stubEnv("POSTHOG_SECRET_KEY", "synthetic-secret-key");
  vi.stubEnv("POSTHOG_PROJECT_ID", "123");
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function setup() {
  const t = convexTest(schema, modules),
    a = t.withIdentity({ subject: "telemetry-owner" }),
    b = t.withIdentity({ subject: "telemetry-other" });
  const id = await a.mutation(internal.athletes.ensureRecord, {});
  await b.mutation(internal.athletes.ensureRecord, {});
  const consent = (value: boolean) =>
    a.mutation(api.athletes.updateProfile, {
      displayName: "Private athlete name",
      timezone: "UTC",
      units: "metric",
      aiConsent: false,
      analyticsConsent: value,
    });
  const event = () =>
    t.run((ctx) =>
      ctx.db
        .query("productEvents")
        .withIndex("by_athlete_event", (q) =>
          q.eq("athleteId", id).eq("event", "activity_viewed"),
        )
        .order("desc")
        .first(),
    );
  return { t, a, b, id, consent, event };
}
it("requires consent, rejects arbitrary payloads and server event spoofing, and sends only the allowlisted envelope", async () => {
  const { t, a, b, id, consent, event } = await setup();
  expect(
    await a.mutation(api.telemetry.track, { event: "activity_viewed" }),
  ).toEqual({ recorded: false });
  await consent(true);
  await expect(
    a.mutation(api.telemetry.track, { event: "premium_activated" }),
  ).rejects.toThrow("server");
  await expect(
    a.mutation(api.telemetry.track, {
      event: "activity_viewed",
      properties: { hr: 190 },
    } as any),
  ).rejects.toThrow();
  await a.mutation(api.telemetry.track, { event: "activity_viewed" });
  const row = (await event())!;
  const capture = vi.fn(async (_url: any, options: any) => {
    const body = JSON.parse(options.body);
    expect(Object.keys(body).sort()).toEqual(
      [
        "api_key",
        "distinct_id",
        "event",
        "properties",
        "timestamp",
        "uuid",
      ].sort(),
    );
    expect(body.properties).toEqual({
      environment: "staging",
      taxonomy_version: 1,
      $geoip_disable: true,
      $ip: null,
    });
    expect(options.body).not.toContain("Private athlete name");
    expect(body.uuid).toMatch(/^[a-f0-9-]{36}$/);
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", capture);
  await t.action(internal.telemetryActions.send, { id: row._id });
  await t.action(internal.telemetryActions.send, { id: row._id });
  expect(capture).toHaveBeenCalledTimes(1);
  expect((await t.run((ctx) => ctx.db.get(id)))?.telemetryTransmitted).toBe(
    true,
  );
  expect(
    (
      await b.query(api.telemetry.page, {
        paginationOpts: { cursor: null, numItems: 100 },
      })
    ).page,
  ).toEqual([]);
  await expect(
    t.query(api.telemetry.page, {
      paginationOpts: { cursor: null, numItems: 100 },
    }),
  ).rejects.toThrow("Sign in");
});
it("invalidates pending sends on withdrawal even after consent is granted again", async () => {
  const { t, a, consent, event } = await setup();
  await consent(true);
  await a.mutation(api.telemetry.track, { event: "activity_viewed" });
  const first = (await event())!;
  const claimed = (await t.mutation(internal.telemetry.claim, {
    id: first._id,
  }))!;
  await consent(false);
  expect(
    await t.query(internal.telemetry.permitted, {
      id: first._id,
      attempt: claimed.attempt,
    }),
  ).toBe(false);
  await consent(true);
  expect(
    await t.query(internal.telemetry.permitted, {
      id: first._id,
      attempt: claimed.attempt,
    }),
  ).toBe(false);
  await t.mutation(internal.telemetry.result, {
    id: first._id,
    attempt: claimed.attempt,
    failed: true,
  });
  const capture = vi.fn();
  vi.stubGlobal("fetch", capture);
  await t.action(internal.telemetryActions.send, { id: first._id });
  expect(capture).not.toHaveBeenCalled();
  expect((await t.run((ctx) => ctx.db.get(first._id)))?.status).toBe("dropped");
});
it("keeps final deletion fenced until asynchronous event erasure is verified", async () => {
  const { t, a, id } = await setup();
  await t.run((ctx) =>
    ctx.db.patch(id, {
      telemetryTransmitted: true,
      telemetryDistinctId: "synthetic:owner",
    }),
  );
  const jobId = await a.mutation(api.lifecycle.requestDeletion, {
    confirmation: "DELETE MY ACCOUNT",
  });
  vi.setSystemTime(Date.now() + 15 * 60000);
  const claim = (await t.mutation(internal.lifecycle.claimDeletion, {
    id: jobId,
  }))!;
  await expect(
    t.mutation(internal.lifecycle.purgeBatch, {
      athleteId: id,
      jobId,
      lease: claim.job.lease,
    }),
  ).rejects.toThrow("erasure");
  let requests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: any, options: any) => {
      requests++;
      const body = JSON.parse(options.body);
      if (requests === 1) {
        expect(body).toEqual({
          distinct_ids: ["synthetic:owner"],
          delete_events: true,
          delete_recordings: true,
        });
        return Response.json(
          { events_queued_for_deletion: true, deletion_errors: [] },
          { status: 202 },
        );
      }
      return Response.json({ results: [[requests === 2 ? 2 : 0]] });
    }),
  );
  expect(
    await t.action(internal.telemetryActions.erase, { athleteId: id }),
  ).toBe(false);
  expect(
    await t.action(internal.telemetryActions.erase, { athleteId: id }),
  ).toBe(false);
  expect(
    (await t.run((ctx) => ctx.db.get(id)))?.telemetryDeletionVerified,
  ).not.toBe(true);
  expect(
    await t.action(internal.telemetryActions.erase, { athleteId: id }),
  ).toBe(true);
  expect(
    (await t.run((ctx) => ctx.db.get(id)))?.telemetryDeletionVerified,
  ).toBe(true);
  await t.mutation(internal.lifecycle.purgeBatch, {
    athleteId: id,
    jobId,
    lease: claim.job.lease,
  });
});
it("keeps local events private when capture configuration is incomplete", async () => {
  const { t, a, consent, event } = await setup();
  await consent(true);
  await a.mutation(api.telemetry.track, { event: "activity_viewed" });
  vi.stubEnv("POSTHOG_SECRET_KEY", "");
  const row = (await event())!,
    capture = vi.fn();
  vi.stubGlobal("fetch", capture);
  await t.action(internal.telemetryActions.send, { id: row._id });
  expect(capture).not.toHaveBeenCalled();
  expect((await t.run((ctx) => ctx.db.get(row._id)))?.status).toBe(
    "local-only",
  );
});
