/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { FunctionReturnType } from "convex/server";
const modules = import.meta.glob("./**/*.ts");

it("pages complete owned workspace collections and bounds calendar reads to the selected dates", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "paged-owner" }),
      b = t.withIdentity({ subject: "paged-other" });
    const athleteId = await a.mutation(api.athletes.ensure, {});
    await b.mutation(api.athletes.ensure, {});
    await t.run(async (ctx) => {
      for (let i = 0; i < 126; i++)
        await ctx.db.insert("plans", {
          athleteId,
          title: `Plan ${i}`,
          sport: "running",
          start: i * 86400000,
          duration: 1800,
          description: "Workout",
        });
    });
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const r: FunctionReturnType<typeof api.workspace.page> = await a.query(
        api.workspace.page,
        {
          table: "plans",
          paginationOpts: { cursor, numItems: 50 },
        },
      );
      expect(r.page.length).toBeLessThanOrEqual(50);
      ids.push(...r.page.map((r) => r._id));
      cursor = r.isDone ? null : r.continueCursor;
    } while (cursor);
    expect(new Set(ids).size).toBe(126);
    const oldestGoal = await t.run(async (ctx) => {
      let first;
      for (let i = 0; i < 126; i++) {
        const id = await ctx.db.insert("goals", {
          athleteId,
          title: `Goal ${i}`,
          kind: "custom",
          target: 2,
          manualProgress: 1,
          start: 0,
          end: Date.now() + 86400000,
        });
        first ??= id;
      }
      return first!;
    });
    const progress = await a.action(api.analytics.calculate, {
      request: {
        tool: "getGoalProgress",
        callId: "oldest-goal",
        goalIds: [oldestGoal],
      },
    });
    expect(progress.find((e) => e.label.endsWith(": current"))?.value).toBe(1);
    await expect(
      b.action(api.analytics.calculate, {
        request: {
          tool: "getGoalProgress",
          callId: "private-goal",
          goalIds: [oldestGoal],
        },
      }),
    ).rejects.toThrow("unavailable");
    const range = await a.query(api.workspace.page, {
      table: "plans",
      from: 10 * 86400000,
      to: 12 * 86400000,
      paginationOpts: { cursor: null, numItems: 100 },
    });
    expect(range.page.map((p) => ("start" in p ? p.start : null))).toEqual(
      [12, 11, 10].map((n) => n * 86400000),
    );
    expect(
      (
        await b.query(api.workspace.page, {
          table: "plans",
          paginationOpts: { cursor: null, numItems: 100 },
        })
      ).page,
    ).toEqual([]);
    await expect(
      t.query(api.workspace.page, {
        table: "plans",
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).rejects.toThrow("Sign in");
    await expect(
      a.query(api.workspace.page, {
        table: "plans",
        from: 20,
        to: 10,
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).rejects.toThrow("date range");
    await expect(
      a.query(api.workspace.page, {
        table: "goals",
        from: 0,
        paginationOpts: { cursor: null, numItems: 100 },
      }),
    ).rejects.toThrow("planned workouts");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});

it("groups custom analytics by the athlete timezone unless the query explicitly chooses another", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "query-timezone" });
    const athleteId = await a.mutation(api.athletes.ensure, {});
    await t.run(async (ctx) => {
      await ctx.db.patch(athleteId, { timezone: "America/New_York" });
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "midnight.gpx",
        key: "private",
        bytes: 1,
        status: "complete",
        attempts: 1,
        createdAt: 0,
      });
      await ctx.db.insert("activities", {
        athleteId,
        sourceId,
        title: "Late local run",
        sport: "running",
        start: Date.parse("2026-09-02T01:00:00Z"),
        duration: 1800,
        summary: {},
        metrics: {},
        route: [],
        streamKey: "private",
        notes: "",
        tags: [],
        gearIds: [],
        excludedRecords: false,
        version: "test",
        createdAt: 0,
      });
    });
    const query = {
      metric: "count",
      aggregate: "count",
      group: "day",
      visual: "table",
      filters: [],
    };
    expect((await a.action(api.queryActions.preview, { query }))[0].label).toBe(
      "2026-09-01",
    );
    expect(
      (
        await a.action(api.queryActions.preview, {
          query: { ...query, timezone: "UTC" },
        })
      )[0].label,
    ).toBe("2026-09-02");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
