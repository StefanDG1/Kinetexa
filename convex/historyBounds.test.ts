/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");

it("continues through metadata-heavy history pages without truncation or exposing another owner", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      owner = t.withIdentity({ subject: "wide-history" }),
      other = t.withIdentity({ subject: "other-history" });
    const athleteId = await owner.mutation(internal.athletes.ensureRecord);
    await other.mutation(internal.athletes.ensureRecord);
    const metadata = "Synthetic source metadata ".repeat(8000);
    await t.run(async (ctx) => {
      for (let i = 0; i < 35; i++) {
        const sourceId = await ctx.db.insert("sources", {
          athleteId,
          name: "wide.tcx",
          key: "synthetic",
          bytes: 1,
          status: "complete",
          attempts: 1,
          createdAt: i,
          importMetadata: { notes: metadata },
        });
        await ctx.db.insert("activities", {
          athleteId,
          sourceId,
          title: "Wide metadata",
          sport: "running",
          start: i + 1,
          duration: 60,
          summary: { sourceMetadata: { creator: metadata } },
          metrics: {},
          route: [],
          streamKey: "synthetic",
          tags: [],
          gearIds: [],
          notes: "",
          excludedRecords: false,
          version: "test",
          createdAt: i,
        });
      }
    });
    const picker = await owner.query(api.activities.browse, {
      view: "picker",
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(picker.page.length).toBeGreaterThan(0);
    expect(picker.page[0]).not.toHaveProperty("summary");
    expect(picker.page[0]).not.toHaveProperty("metrics");
    expect(picker.page[0].route).toEqual([]);
    expect(
      await owner.query(api.activities.selection, { id: picker.page[0]._id }),
    ).toEqual({ _id: picker.page[0]._id, title: "Wide metadata" });
    expect(
      await other.query(api.activities.selection, { id: picker.page[0]._id }),
    ).toBeNull();
    expect(
      await owner.query(api.activities.selection, { id: "invalid" }),
    ).toBeNull();
    expect(
      (
        await other.query(api.activities.browse, {
          view: "picker",
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toEqual([]);
    for (const endpoint of [api.activities.page, api.imports.page]) {
      let cursor: string | null = null;
      const ids = new Set<string>();
      let pages = 0;
      do {
        const result: {
          page: { _id: string }[];
          isDone: boolean;
          continueCursor: string;
        } = await owner.query(endpoint, {
          paginationOpts: { numItems: 100, cursor },
        });
        expect(result.page.length).toBeGreaterThan(0);
        expect(result.page.length).toBeLessThan(35);
        for (const row of result.page) {
          expect(ids.has(row._id)).toBe(false);
          ids.add(row._id);
        }
        pages++;
        cursor = result.isDone ? null : result.continueCursor;
      } while (cursor);
      expect(ids.size).toBe(35);
      expect(pages).toBeGreaterThan(1);
      expect(
        (
          await other.query(endpoint, {
            paginationOpts: { numItems: 100, cursor: null },
          })
        ).page,
      ).toEqual([]);
    }
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
