/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { recordOperation } from "./operationModel";
const modules = import.meta.glob("./**/*.ts");
it("counts operations once, finds backlogs, reports alert changes and keeps private job payloads out of inspection", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "operator-fixture" }),
      athleteId = await a.mutation(api.athletes.ensure),
      now = Date.now();
    const ids = await t.run(async (ctx) => {
      for (let i = 0; i < 10; i++) {
        const event = {
          kind: "import" as const,
          athleteId,
          jobId: `fixture-${i}`,
          outcome: i < 5 ? "failed" : "complete",
          startedAt: now - 1000,
          measures: { bytes: 10 },
        };
        await recordOperation(ctx, event);
        await recordOperation(ctx, event);
      }
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "private filename.fit",
        key: "private/object/key",
        status: "queued",
        attempts: 0,
        bytes: 1,
        createdAt: now - 31 * 60000,
      });
      const emailId = await ctx.db.insert("outbox", {
        athleteId,
        template: "welcome",
        dedupeKey: "private-email-key",
        status: "delivery-unknown",
        attempts: 4,
        createdAt: now,
        payload: {
          to: "private@example.invalid",
          from: "sender@example.invalid",
          subject: "Private",
          text: "Private",
        },
      });
      return { sourceId, emailId };
    });
    const first = await t.action(internal.operations.check, {});
    expect(first.metrics.import).toMatchObject({
      events: 10,
      failures: 5,
      bytes: 100,
      p95Ms: 1000,
    });
    expect(first.newAlerts).toEqual(
      expect.arrayContaining(["import-backlog", "import-failure-rate"]),
    );
    expect((await t.action(internal.operations.check, {})).newAlerts).toEqual(
      [],
    );
    const jobs = await t.query(internal.operations.jobs, {
      kind: "email",
      status: "delivery-unknown",
      cursor: null,
    });
    expect(JSON.stringify(jobs)).not.toContain("private@example.invalid");
    expect(JSON.stringify(jobs)).not.toContain("private-email-key");
    await expect(
      t.mutation(internal.operations.retry, { kind: "email", id: ids.emailId }),
    ).rejects.toThrow("requires review");
    await t.run((ctx) => ctx.db.patch(ids.sourceId, { status: "complete" }));
    vi.setSystemTime(now + 86400001);
    const recovered = await t.action(internal.operations.check, {});
    expect(recovered.recovered).toEqual(
      expect.arrayContaining(["import-backlog", "import-failure-rate"]),
    );
    vi.setSystemTime(now + 31 * 86400000);
    await t.mutation(internal.operations.prune, {});
    expect(
      await t.run((ctx) => ctx.db.query("operationalEvents").collect()),
    ).toEqual([]);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
it("retries only eligible failed work and preserves expired exports and locked-account boundaries", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "retry-fixture" }),
      athleteId = await a.mutation(api.athletes.ensure);
    const ids = await t.run(async (ctx) => ({
      source: await ctx.db.insert("sources", {
        athleteId,
        name: "retained.fit",
        key: "unchanged",
        status: "failed",
        attempts: 4,
        bytes: 1,
        createdAt: Date.now(),
      }),
      old: await ctx.db.insert("lifecycleJobs", {
        athleteId,
        kind: "export",
        status: "failed",
        createdAt: Date.now() - 8 * 86400000,
      }),
      current: await ctx.db.insert("lifecycleJobs", {
        athleteId,
        kind: "export",
        status: "failed",
        createdAt: Date.now(),
        lease: 4,
      }),
    }));
    await expect(
      t.mutation(internal.operations.retry, { kind: "export", id: ids.old }),
    ).rejects.toThrow("expired");
    await t.mutation(internal.operations.retry, {
      kind: "import",
      id: ids.source,
    });
    expect(await t.run((ctx) => ctx.db.get(ids.source))).toMatchObject({
      status: "queued",
      key: "unchanged",
      attempts: 4,
    });
    await expect(
      t.mutation(internal.operations.retry, { kind: "import", id: ids.source }),
    ).rejects.toThrow("not awaiting");
    await t.mutation(internal.operations.retry, {
      kind: "export",
      id: ids.current,
    });
    expect(await t.run((ctx) => ctx.db.get(ids.current))).toMatchObject({
      status: "retrying",
      lease: 4,
    });
    await t.run((ctx) => ctx.db.patch(athleteId, { status: "deleting" }));
    await expect(
      t.mutation(internal.operations.retry, { kind: "import", id: ids.source }),
    ).rejects.toThrow("Account state");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
it("keeps production athlete APIs closed until release while private monitoring remains available", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "release-gate" });
    const athleteId = await a.mutation(api.athletes.ensure);
    vi.stubEnv("KINETEXA_ENVIRONMENT", "production");
    vi.stubEnv("KINETEXA_APP_ENABLED", "false");
    expect(await a.query(api.athletes.current)).toBeNull();
    await expect(a.query(api.workspace.overview)).rejects.toThrow("not open");
    await expect(a.mutation(api.athletes.ensure)).rejects.toThrow("not open");
    expect((await t.action(internal.operations.check, {})).alerts).toEqual([]);
    expect(await t.run((ctx) => ctx.db.get(athleteId))).not.toBeNull();
    vi.stubEnv("KINETEXA_APP_ENABLED", "true");
    expect((await a.query(api.athletes.current))?._id).toBe(athleteId);
  } finally {
    vi.unstubAllEnvs();
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
