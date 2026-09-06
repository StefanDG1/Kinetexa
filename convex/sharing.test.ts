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
  const payload = await t.query(api.sharing.publicView, { token });
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
  expect(await t.query(api.sharing.publicView, { token })).toBeNull();
});
