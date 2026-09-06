/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
it("projects only selected public fields, masks geometry and revokes immediately", async () => {
  const t = convexTest(schema, modules),
    a = t.withIdentity({ subject: "owner" }),
    b = t.withIdentity({ subject: "intruder" });
  const aid = await a.mutation(api.athletes.ensure);
  await b.mutation(api.athletes.ensure);
  const id = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      athleteId: aid,
      name: "private.fit",
      key: "secret/key",
      bytes: 10,
      status: "complete",
      attempts: 1,
      createdAt: 0,
    });
    return ctx.db.insert("activities", {
      athleteId: aid,
      title: "Private title",
      sport: "running",
      start: 1,
      duration: 100,
      distance: 1000,
      summary: { avgHr: 165 },
      metrics: {},
      route: [
        [0, 0],
        [0.002, 0],
        [0.01, 0],
        [0.02, 0],
      ],
      streamKey: "secret/stream",
      sourceId,
      notes: "private notes",
      tags: [],
      gearIds: [],
      excludedRecords: false,
      version: "test",
      createdAt: 0,
    });
  });
  const token = "a".repeat(64),
    sid = await a.mutation(api.sharing.create, {
      token,
      kind: "activity",
      activityIds: [id],
      fields: ["sport", "route"],
    });
  const payload = await t.mutation(api.sharing.publicView, { token });
  await expect(
    a.mutation(api.sharing.create, {
      token,
      kind: "activity",
      activityIds: [id],
      fields: ["sport"],
    }),
  ).rejects.toThrow("already in use");
  const json = JSON.stringify(payload);
  expect(json).not.toContain("secret");
  expect(json).not.toContain("Private title");
  expect(json).not.toContain("avgHr");
  expect(json).not.toContain("private notes");
  expect(
    (payload?.activities[0].route as number[][][]).flat(),
  ).not.toContainEqual([0, 0]);
  await expect(b.mutation(api.sharing.revoke, { id: sid })).rejects.toThrow(
    "unavailable",
  );
  await a.mutation(api.sharing.revoke, { id: sid });
  expect(await t.mutation(api.sharing.publicView, { token })).toBeNull();
});

it("keeps share preview and creation validation aligned and totals privacy-limited", async () => {
  const t = convexTest(schema, modules),
    owner = t.withIdentity({ subject: "share-owner" }),
    stranger = t.withIdentity({ subject: "share-stranger" });
  const athleteId = await owner.mutation(api.athletes.ensure);
  await stranger.mutation(api.athletes.ensure);
  const ids = await t.run(async (ctx) => {
    await ctx.db.patch(athleteId, { timezone: "America/New_York" });
    const sourceId = await ctx.db.insert("sources", {
      athleteId,
      name: "private.gpx",
      key: "private/source",
      bytes: 10,
      status: "complete",
      attempts: 1,
      createdAt: 0,
    });
    const base = {
      athleteId,
      sourceId,
      title: "Secret",
      sport: "running",
      start: Date.parse("2026-09-02T01:00:00Z"),
      duration: 100,
      summary: { avgHr: 160 },
      metrics: {},
      route: [],
      streamKey: "private/stream",
      notes: "Private note",
      tags: [],
      gearIds: [],
      excludedRecords: false,
      version: "test",
      createdAt: 0,
    };
    return [
      await ctx.db.insert("activities", { ...base, distance: 0 }),
      await ctx.db.insert("activities", base),
    ];
  });
  const valid = {
    kind: "statistics",
    activityIds: ids,
    fields: ["distance", "elevation", "date"],
  };
  for (const invalid of [
    { ...valid, kind: "unknown" },
    { ...valid, fields: [] },
    { ...valid, fields: ["notes"] },
    { ...valid, fields: ["distance", "distance"] },
    { ...valid, activityIds: [ids[0], ids[0]] },
  ]) {
    await expect(owner.query(api.sharing.preview, invalid)).rejects.toThrow();
    await expect(
      owner.mutation(api.sharing.create, { ...invalid, token: "b".repeat(64) }),
    ).rejects.toThrow();
  }
  await expect(stranger.query(api.sharing.preview, valid)).rejects.toThrow();
  await expect(
    stranger.mutation(api.sharing.create, { ...valid, token: "b".repeat(64) }),
  ).rejects.toThrow();
  for (const [i, kind] of [
    "activity",
    "dashboard",
    "statistics",
    "map",
  ].entries()) {
    const selection = { ...valid, kind },
      token = String(i).repeat(64);
    const preview = await owner.query(api.sharing.preview, selection);
    await owner.mutation(api.sharing.create, { ...selection, token });
    expect(await t.mutation(api.sharing.publicView, { token })).toEqual(
      preview,
    );
    expect(preview.activities.map((a) => a.date)).toEqual([
      "2026-09-01",
      "2026-09-01",
    ]);
    expect(JSON.stringify(preview)).not.toMatch(
      /Secret|Private|avgHr|private\//,
    );
    if (["dashboard", "statistics"].includes(kind))
      expect(preview.totals).toEqual({
        distance: { value: 0, measuredCount: 1, missingCount: 1, unit: "m" },
        elevation: {
          value: null,
          measuredCount: 0,
          missingCount: 2,
          unit: "m",
        },
      });
    else expect(preview.totals).toEqual({});
  }
  // Existing links also deduplicate, including links made by earlier versions.
  await t.run(async (ctx) => {
    const share = await ctx.db
      .query("shares")
      .withIndex("by_token", (q) => q.eq("token", "2".repeat(64)))
      .unique();
    await ctx.db.patch(share!._id, { activityIds: [ids[0], ids[0], ids[1]] });
  });
  expect(
    (await t.mutation(api.sharing.publicView, { token: "2".repeat(64) }))
      ?.activities,
  ).toHaveLength(2);
});

it("reapplies changed privacy zones and denies expired or inactive-owner links immediately", async () => {
  const t = convexTest(schema, modules),
    owner = t.withIdentity({ subject: "mask-owner" });
  const athleteId = await owner.mutation(api.athletes.ensure);
  const id = await t.run(async (ctx) => {
    const sourceId = await ctx.db.insert("sources", {
      athleteId,
      name: "private.gpx",
      key: "private/source",
      bytes: 10,
      status: "complete",
      attempts: 1,
      createdAt: 0,
    });
    return ctx.db.insert("activities", {
      athleteId,
      sourceId,
      title: "Private",
      sport: "running",
      start: 0,
      duration: 100,
      summary: {},
      metrics: {},
      route: Array.from({ length: 21 }, (_, i) => [i * 0.001, 0]),
      streamKey: "private/stream",
      notes: "",
      tags: [],
      gearIds: [],
      excludedRecords: false,
      version: "test",
      createdAt: 0,
    });
  });
  const token = "c".repeat(64),
    expires = Date.now() + 60000;
  await owner.mutation(api.sharing.create, {
    token,
    kind: "map",
    activityIds: [id],
    fields: ["route"],
    expires,
  });
  const before = await t.mutation(api.sharing.publicView, { token });
  expect((before?.activities[0].route as number[][][]).flat()).toContainEqual([
    0.01, 0,
  ]);
  await owner.mutation(api.workspace.saveZone, {
    name: "Private location",
    lat: 0,
    lon: 0.01,
    radius: 300,
  });
  const after = await t.mutation(api.sharing.publicView, { token });
  expect(
    (after?.activities[0].route as number[][][]).flat(),
  ).not.toContainEqual([0.01, 0]);
  await t.run((ctx) => ctx.db.patch(athleteId, { status: "deleting" }));
  expect(await t.mutation(api.sharing.publicView, { token })).toBeNull();
  await t.run((ctx) => ctx.db.patch(athleteId, { status: "active" }));
  vi.setSystemTime(expires - 1);
  expect(await t.mutation(api.sharing.publicView, { token })).not.toBeNull();
  vi.setSystemTime(expires);
  // No scheduler has run: expiry must be enforced by the read itself.
  expect(await t.mutation(api.sharing.publicView, { token })).toBeNull();
});

it("limits public reads per link before projection, resets the counter without visitor history", async () => {
  const t = convexTest(schema, modules),
    owner = t.withIdentity({ subject: "rate-owner" });
  const athleteId = await owner.mutation(api.athletes.ensure);
  vi.setSystemTime(1800000000000);
  const token = "e".repeat(64);
  const id = await t.run((ctx) =>
    ctx.db.insert("shares", {
      athleteId,
      token,
      kind: "map",
      activityIds: [],
      fields: ["route"],
      revoked: false,
      createdAt: Date.now(),
    }),
  );
  for (let i = 0; i < 120; i++)
    expect(await t.mutation(api.sharing.publicView, { token })).not.toBeNull();
  await expect(
    t.mutation(api.sharing.publicView, { token }),
  ).rejects.toMatchObject({
    data: { code: "SHARE_RATE_LIMITED", retryAfterSeconds: 60 },
  });
  // Invalid tokens do not allocate rate-limit rows or alter the valid link's counter.
  expect(
    await t.mutation(api.sharing.publicView, { token: "f".repeat(64) }),
  ).toBeNull();
  expect(
    await t.mutation(api.sharing.publicView, { token: "invalid" }),
  ).toBeNull();
  expect(await t.run(async (ctx) => (await ctx.db.get(id))?.viewCount)).toBe(
    120,
  );
  vi.setSystemTime(1800000060000);
  expect(await t.mutation(api.sharing.publicView, { token })).not.toBeNull();
  const row = await t.run((ctx) => ctx.db.get(id));
  expect(row?.viewCount).toBe(1);
  expect(await t.run((ctx) => ctx.db.query("shares").collect())).toHaveLength(
    1,
  );
  await owner.mutation(api.sharing.revoke, { id });
  expect(await t.mutation(api.sharing.publicView, { token })).toBeNull();
  expect(await t.run(async (ctx) => (await ctx.db.get(id))?.viewCount)).toBe(1);
});
