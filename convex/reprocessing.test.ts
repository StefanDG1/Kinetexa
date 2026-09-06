/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const storage = vi.hoisted(() => ({ bytes: new Uint8Array(), put: vi.fn() }));
vi.mock("./storage", () => ({
  getObject: async () => storage.bytes,
  putObject: storage.put,
}));
beforeEach(() => {
  vi.useFakeTimers();
  storage.put.mockReset();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function setup() {
  const t = convexTest(schema, modules),
    a = t.withIdentity({ subject: "reprocess-owner" }),
    b = t.withIdentity({ subject: "reprocess-other" });
  const athleteId = await a.mutation(api.athletes.ensure);
  await b.mutation(api.athletes.ensure);
  storage.bytes = new TextEncoder().encode(
    '<gpx><trk><name>Source name</name><type>running</type><trkseg><trkpt lat="45" lon="25"><time>2026-09-01T00:00:00Z</time></trkpt><trkpt lat="45.0001" lon="25"><time>2026-09-01T00:00:10Z</time></trkpt></trkseg></trk></gpx>',
  );
  const hash = createHash("sha256").update(storage.bytes).digest("hex");
  const sourceId = await t.run((ctx) =>
    ctx.db.insert("sources", {
      athleteId,
      name: "run.gpx",
      key: `${athleteId}/originals/test`,
      bytes: storage.bytes.length,
      hash,
      status: "complete",
      attempts: 1,
      createdAt: Date.now(),
      externalAi: "allowed",
    }),
  );
  const activityId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("activities", {
      athleteId,
      sourceId,
      title: "My edited title",
      notes: "Private edited note",
      tags: ["race"],
      gearIds: [],
      excludedRecords: true,
      sport: "running",
      start: Date.parse("2026-09-01"),
      duration: 10,
      distance: 10,
      summary: {
        sport: "running",
        start: Date.parse("2026-09-01"),
        duration: 10,
        distance: 10,
      },
      metrics: { old: true },
      route: [],
      streamKey: `${athleteId}/streams/previous.json`,
      version: "previous",
      createdAt: 0,
    });
    await ctx.db.patch(sourceId, { activityId: id });
    await ctx.db.insert("health", {
      athleteId,
      sourceId,
      source: "run.gpx",
      date: "2026-09-01",
      kind: "restingHr",
      value: 49,
    });
    return id;
  });
  return { t, a, b, athleteId, sourceId, activityId, hash };
}
const healthRange = {
  from: "2026-09-01",
  to: "2026-09-02",
  paginationOpts: { cursor: null, numItems: 100 },
};
it("publishes a complete replacement once, preserving edits, original checksums and previous metric evidence", async () => {
  const { t, a, b, sourceId, activityId, hash } = await setup();
  await expect(
    b.mutation(api.reprocessing.request, { id: sourceId }),
  ).rejects.toThrow("File unavailable");
  await a.mutation(api.reprocessing.request, { id: sourceId });
  const run = (await t.mutation(internal.reprocessing.claim, {
    id: sourceId,
  }))!;
  expect(
    await t.mutation(internal.reprocessing.claim, { id: sourceId }),
  ).toBeNull();
  const batch = {
    id: sourceId,
    attempt: run.attempt,
    samples: [
      { at: Date.parse("2026-09-01"), kind: "weight", value: 70, unit: "kg" },
    ],
  };
  await t.mutation(internal.reprocessing.stageHealth, batch);
  await t.mutation(internal.reprocessing.stageHealth, batch);
  expect(
    (await a.query(api.health.page, healthRange)).page.map((r) => r.kind),
  ).toEqual(["restingHr"]);
  expect(
    (await a.query(api.health.status)).available.find(
      (r) => r.kind === "weight",
    )?.available,
  ).toBe(false);
  const finish = {
    id: sourceId,
    attempt: run.attempt,
    healthRebuilt: true,
    healthRevision: run.healthRevision,
    thresholds: run.thresholds,
    timezone: run.timezone,
    parsed: {
      metrics: { rebuilt: true },
      summary: {
        sport: "running",
        start: Date.parse("2026-09-01"),
        duration: 10,
        distance: 12,
      },
      route: [],
      streamKey: "new-version",
    },
  };
  expect(await t.mutation(internal.reprocessing.finish, finish)).toBe(true);
  expect(await t.mutation(internal.reprocessing.finish, finish)).toBe(false);
  expect(
    (await a.query(api.health.page, healthRange)).page.map((r) => [
      r.kind,
      r.value,
    ]),
  ).toEqual([["weight", 70]]);
  expect((await b.query(api.health.page, healthRange)).page).toEqual([]);
  const activity = await a.query(api.activities.get, { id: activityId });
  expect(activity).toMatchObject({
    title: "My edited title",
    notes: "Private edited note",
    tags: ["race"],
    excludedRecords: true,
    distance: 12,
    streamKey: "new-version",
  });
  const provenance = await a.query(api.activities.provenance, {
    id: activityId,
  });
  expect(provenance.source?.hash).toBe(hash);
  expect(provenance.history).toHaveLength(1);
  expect(provenance.history[0]).toMatchObject({
    version: "previous",
    metrics: { old: true },
    summary: { distance: 10 },
  });
  await t.mutation(internal.reprocessing.pruneHealth, {
    id: sourceId,
    cursor: null,
  });
  expect(await t.run((ctx) => ctx.db.query("health").collect())).toHaveLength(
    1,
  );
});
it("fences interrupted attempts and stops automatic retries after four attempts", async () => {
  const { t, a, sourceId } = await setup();
  await a.mutation(api.reprocessing.request, { id: sourceId });
  for (let attempt = 1; attempt <= 4; attempt++) {
    expect(
      (await t.mutation(internal.reprocessing.claim, { id: sourceId }))
        ?.attempt,
    ).toBe(attempt);
    await t.mutation(internal.reprocessing.watchdog, { id: sourceId, attempt });
    expect(
      (await a.query(api.imports.owned, { id: sourceId })).reprocessStatus,
    ).toBe(attempt < 4 ? "queued" : "failed");
  }
  await expect(
    t.mutation(internal.reprocessing.stageHealth, {
      id: sourceId,
      attempt: 1,
      samples: [],
    }),
  ).rejects.toThrow("expired");
  expect((await a.query(api.health.page, healthRange)).page[0].value).toBe(49);
});
it("keeps prior health after a preference change and reschedules a concurrent threshold change", async () => {
  const { t, a, sourceId, athleteId } = await setup();
  await a.mutation(api.reprocessing.request, { id: sourceId });
  const run = (await t.mutation(internal.reprocessing.claim, {
    id: sourceId,
  }))!;
  await t.mutation(internal.reprocessing.stageHealth, {
    id: sourceId,
    attempt: run.attempt,
    samples: [
      {
        at: Date.parse("2026-09-01"),
        kind: "restingHr",
        value: 47,
        unit: "bpm",
      },
    ],
  });
  await a.mutation(api.health.setProcessing, { enabled: false });
  await a.mutation(api.health.setProcessing, { enabled: true });
  const finish = {
    id: sourceId,
    attempt: run.attempt,
    healthRebuilt: true,
    healthRevision: run.healthRevision,
    thresholds: run.thresholds,
    timezone: run.timezone,
  };
  expect(await t.mutation(internal.reprocessing.finish, finish)).toBe(true);
  expect(
    (await a.query(api.health.page, healthRange)).page.map((r) => r.value),
  ).toEqual([49]);
  await a.mutation(api.reprocessing.request, { id: sourceId });
  const next = (await t.mutation(internal.reprocessing.claim, {
    id: sourceId,
  }))!;
  await t.run((ctx) => ctx.db.patch(athleteId, { thresholds: { ftp: 250 } }));
  expect(
    await t.mutation(internal.reprocessing.finish, {
      ...finish,
      attempt: next.attempt,
    }),
  ).toBe(false);
  expect(
    (await a.query(api.imports.owned, { id: sourceId })).reprocessStatus,
  ).toBe("queued");
  await t.run((ctx) => ctx.db.patch(athleteId, { status: "deleting" }));
  expect(
    await t.mutation(internal.reprocessing.claim, { id: sourceId }),
  ).toBeNull();
});
it("reparses retained bytes into a new stream and rejects checksum corruption without overwriting live results", async () => {
  const { t, a, sourceId, activityId } = await setup();
  await a.mutation(api.reprocessing.request, { id: sourceId });
  await t.action(internal.reprocessingActions.source, { id: sourceId });
  const rebuilt = await a.query(api.activities.get, { id: activityId });
  expect(rebuilt.title).toBe("My edited title");
  expect(rebuilt.streamKey).toContain("-reprocess-1.json");
  expect(storage.put).toHaveBeenCalledTimes(1);
  await a.mutation(api.reprocessing.request, { id: sourceId });
  storage.bytes[20] ^= 1;
  await t.action(internal.reprocessingActions.source, { id: sourceId });
  expect(
    (await a.query(api.imports.owned, { id: sourceId })).reprocessError,
  ).toContain("integrity check");
  expect(
    (await a.query(api.activities.get, { id: activityId })).streamKey,
  ).toBe(rebuilt.streamKey);
  expect(storage.put).toHaveBeenCalledTimes(1);
});
