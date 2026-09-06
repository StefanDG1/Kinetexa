/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("resumes index preparation, keeps edits and merges transactional, and reads current source policy without exposing geometry", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "facts-owner" }),
      b = t.withIdentity({ subject: "facts-other" });
    const athleteId = await a.mutation(internal.athletes.ensureRecord);
    await b.mutation(internal.athletes.ensureRecord);
    const { sourceId, ids } = await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "fixture.fit",
        key: "private",
        bytes: 1,
        status: "complete",
        attempts: 1,
        createdAt: 0,
        externalAi: "allowed",
      });
      const ids = [];
      for (let i = 1; i <= 105; i++)
        ids.push(
          await ctx.db.insert("activities", {
            athleteId,
            sourceId,
            title: "Run",
            sport: "running",
            start: i,
            duration: 1,
            distance: 10,
            summary: { laps: [{ private: true }] },
            metrics: {},
            route: [
              [25, 45],
              [25.1, 45.1],
            ],
            streamKey: "private",
            notes: "private note",
            tags: [],
            gearIds: [],
            excludedRecords: false,
            version: "test",
            createdAt: 0,
          }),
        );
      return { sourceId, ids };
    });
    expect(await a.mutation(api.activityFacts.prepare)).toBe(false);
    await expect(
      a.query(api.activityFacts.page, { cursor: null }),
    ).rejects.toThrow("Prepare");
    while (!(await a.mutation(api.activityFacts.prepare))) {}
    let page = await a.query(api.activityFacts.page, { cursor: null });
    expect(page.page).toHaveLength(105);
    expect(page.page.every((r) => r.hasRoute && r.aiEligible)).toBe(true);
    expect(JSON.stringify(page)).not.toContain("private note");
    expect(page.page[0].route).toBeUndefined();
    expect(page.page[0].summary.laps).toBeUndefined();
    const first = await a.query(api.activities.page, {
      paginationOpts: { cursor: null, numItems: 100 },
    });
    vi.setSystemTime(Date.now() + 86400000);
    const second = await a.query(api.activities.page, {
      paginationOpts: { cursor: first.continueCursor, numItems: 100 },
    });
    expect(second.page).toHaveLength(5);
    await a.mutation(api.activities.update, {
      id: ids[0],
      title: "Edited",
      notes: "still private",
      tags: ["race"],
      gearIds: [],
      excludedRecords: true,
    });
    await a.mutation(api.activities.merge, { id: ids[1], into: ids[0] });
    page = await a.query(api.activityFacts.page, { cursor: null });
    expect(page.page).toHaveLength(104);
    expect(page.page.find((r) => r._id === ids[0])).toMatchObject({
      title: "Edited",
      tags: ["race"],
      excludedRecords: true,
    });
    await a.mutation(api.activities.merge, { id: ids[1] });
    await t.run((ctx) => ctx.db.patch(sourceId, { externalAi: "blocked" }));
    page = await a.query(api.activityFacts.page, { cursor: null });
    expect(page.page).toHaveLength(105);
    expect(page.page.every((r) => r.aiEligible === false)).toBe(true);
    await b.mutation(api.activityFacts.prepare);
    expect(
      (await b.query(api.activityFacts.page, { cursor: null })).page,
    ).toEqual([]);
    await t.mutation(internal.activityFacts.rebuild, { athleteId });
    while (!(await a.mutation(api.activityFacts.prepare))) {}
    expect(
      (await a.query(api.activityFacts.page, { cursor: null })).page,
    ).toHaveLength(105);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
