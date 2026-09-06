/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("keeps duplicate groups flat, reversible and owner-authorized", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "merge-owner" }),
      b = t.withIdentity({ subject: "merge-other" });
    const athleteId = await a.mutation(internal.athletes.ensureRecord);
    await b.mutation(internal.athletes.ensureRecord);
    const ids = await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "fixture.fit",
        key: "fixture",
        bytes: 1,
        status: "complete",
        attempts: 1,
        createdAt: 0,
      });
      const ids = [];
      for (let i = 0; i < 3; i++)
        ids.push(
          await ctx.db.insert("activities", {
            athleteId,
            sourceId,
            streamKey: "fixture",
            title: `Activity ${i}`,
            sport: "running",
            start: i,
            duration: 60,
            summary: {},
            metrics: {},
            route: [],
            notes: "",
            tags: [],
            gearIds: [],
            excludedRecords: false,
            version: "test",
            createdAt: 0,
          }),
        );
      return ids;
    });
    await a.mutation(api.activities.merge, { id: ids[1], into: ids[0] });
    await expect(
      a.mutation(api.activities.merge, { id: ids[0], into: ids[2] }),
    ).rejects.toThrow("Unmerge");
    await expect(
      a.mutation(api.activities.merge, { id: ids[2], into: ids[1] }),
    ).rejects.toThrow("unmerged");
    await expect(
      b.mutation(api.activities.merge, { id: ids[1] }),
    ).rejects.toThrow("unavailable");
    expect(await a.query(api.activities.list, {})).toHaveLength(2);
    await a.mutation(api.activities.merge, { id: ids[1] });
    expect(await a.query(api.activities.list, {})).toHaveLength(3);
    await a.mutation(api.activities.merge, { id: ids[0], into: ids[2] });
    expect(await a.query(api.activities.list, {})).toHaveLength(2);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
