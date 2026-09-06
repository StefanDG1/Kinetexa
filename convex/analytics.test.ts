/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { analyze } from "../packages/core/analytics";
const modules = import.meta.glob("./**/*.ts");
it("serves deterministic analytics with AI off, includes privately owned provider data and isolates other accounts", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "analytics-owner" }),
      b = t.withIdentity({ subject: "analytics-other" });
    const athleteId = await a.mutation(internal.athletes.ensureRecord);
    await b.mutation(internal.athletes.ensureRecord);
    const activityId = await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "restricted-provider.fit",
        key: "private",
        bytes: 1,
        attempts: 1,
        status: "complete",
        createdAt: 0,
        externalAi: "blocked",
      });
      const input = {
        title: "Private ride",
        sport: "cycling" as const,
        start: Date.parse("2026-09-01"),
        duration: 3600,
        distance: 36000,
        samples: Array.from({ length: 3601 }, (_, t) => ({ t, power: 200 })),
        laps: [],
      };
      const { samples: _samples, ...summary } = input;
      return ctx.db.insert("activities", {
        athleteId,
        sourceId,
        title: summary.title,
        sport: summary.sport,
        start: summary.start,
        duration: summary.duration,
        distance: summary.distance,
        summary,
        metrics: analyze(input, { ftp: 200 }),
        route: [],
        streamKey: "private",
        tags: [],
        gearIds: [],
        notes: "",
        excludedRecords: false,
        version: "test",
        createdAt: 0,
      });
    });
    expect((await a.query(api.athletes.current))?.aiConsent).toBe(false);
    const request = {
      tool: "getTrainingLoad",
      callId: "load",
      period: { from: "2026-09-01", to: "2026-09-02" },
    };
    const result = await a.action(api.analytics.calculate, { request });
    expect(result.some((r) => r.value === 100)).toBe(true);
    expect(result.flatMap((r) => r.activityIds)).toContain(activityId);
    expect(result.every((r) => r.query?.aiEligibleOnly !== true)).toBe(true);
    const other = await b.action(api.analytics.calculate, { request });
    expect(other.flatMap((r) => r.activityIds)).toEqual([]);
    await expect(
      b.action(api.analytics.calculate, {
        request: { tool: "getActivity", callId: "private", activityId },
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      a.action(api.analytics.calculate, {
        request: {
          tool: "executeSql",
          callId: "bad",
          sql: "select * from activities",
        },
      }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("aiRuns").collect())).toEqual([]);
    const overview = await a.action(api.analytics.dashboard, {
      from: Date.parse("2026-09-01"),
      to: Date.parse("2026-09-02"),
    });
    expect(overview.totals.distance).toBe(36000);
    expect(overview.selectedCount).toBe(1);
    expect("selected" in overview).toBe(false);
    expect(overview.explanations.fitness.inputs).toMatchObject({
      chronicDays: 42,
      acuteDays: 7,
    });
    const preferences = {
      thresholds: { restHr: 120, maxHr: 110 },
      dashboard: [],
      hiddenWidgets: [],
      insightConsent: false,
    };
    await expect(
      a.mutation(api.workspace.settings, preferences),
    ).rejects.toThrow("Maximum heart rate must exceed resting heart rate");
    expect((await a.query(api.athletes.current))?.thresholds).toBeUndefined();
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
