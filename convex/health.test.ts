/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("keeps health private, honors processing preferences and pages beyond the former history cap", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "health-owner" }),
      b = t.withIdentity({ subject: "health-other" }),
      aid = await a.mutation(internal.athletes.ensureRecord);
    await b.mutation(internal.athletes.ensureRecord);
    const source = await a.mutation(api.imports.reserve, {
        name: "health.fit",
        bytes: 100,
        nonce: "12345678-1234-1234-1234-123456789abc",
      }),
      sample = {
        at: Date.parse("2026-09-06"),
        kind: "restingHr",
        value: 48,
        unit: "bpm",
      };
    await a.mutation(api.health.setProcessing, { enabled: false });
    await t.mutation(internal.imports.health, {
      id: source,
      hash: "a".repeat(64),
      samples: [sample],
    });
    expect(
      (await a.query(api.health.status)).available.some((s) => s.available),
    ).toBe(false);
    await a.mutation(api.health.setProcessing, { enabled: true });
    await t.mutation(internal.imports.health, {
      id: source,
      hash: "a".repeat(64),
      samples: [sample],
    });
    await t.mutation(internal.imports.health, {
      id: source,
      hash: "a".repeat(64),
      samples: [sample],
    });
    await t.run(async (ctx) => {
      for (let i = 0; i < 510; i++)
        await ctx.db.insert("health", {
          athleteId: aid,
          date: new Date(Date.parse("2025-01-01") + i * 86400000)
            .toISOString()
            .slice(0, 10),
          kind: "weight",
          value: 70,
          source: "Synthetic",
          sourceId: source,
        });
    });
    let cursor: string | null = null,
      count = 0;
    do {
      const page: { page: unknown[]; isDone: boolean; continueCursor: string } =
        await a.query(api.health.page, {
          from: "2025-01-01",
          to: "2026-12-31",
          paginationOpts: { numItems: 1000, cursor },
        });
      expect(page.page.length).toBeLessThanOrEqual(100);
      count += page.page.length;
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    expect(count).toBe(511);
    expect(
      (
        await b.query(api.health.page, {
          from: "2025-01-01",
          to: "2026-12-31",
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toEqual([]);
    expect((await b.query(api.health.status)).hasSource).toBe(false);
    for (const from of ["2026-02-29", "2026-02-30", "2026-13-01"])
      await expect(
        a.query(api.health.page, {
          from,
          to: "2026-12-31",
          paginationOpts: { numItems: 100, cursor: null },
        }),
      ).rejects.toThrow("valid date range");
    expect(
      (
        await a.query(api.health.page, {
          from: "2024-02-29",
          to: "2024-02-29",
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toEqual([]);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
