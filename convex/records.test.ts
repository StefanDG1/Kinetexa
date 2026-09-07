/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { analyze } from "../packages/core/analytics";
import type { Activity } from "../packages/core/model";
const modules = import.meta.glob("./**/*.ts");

it("separates record sports, respects local calendar scopes and applies private exclusions without losing local efforts", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
  try {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "records-owner" });
    const other = t.withIdentity({ subject: "records-other" });
    const athleteId = await owner.mutation(internal.athletes.ensureRecord);
    await other.mutation(internal.athletes.ensureRecord);
    const ids = await t.run(async (ctx) => {
      await ctx.db.patch(athleteId, { timezone: "Europe/Bucharest" });
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "synthetic-records.fit",
        key: "private",
        bytes: 1,
        attempts: 1,
        status: "complete",
        createdAt: 0,
      });
      const fixtures = [
        {
          title: "Old run",
          start: "2025-12-31T20:00:00Z",
          speed: 10,
          power: 900,
          sport: "running",
        },
        {
          title: "Local new year",
          start: "2025-12-31T22:30:00Z",
          speed: 8,
          power: 800,
          sport: "running",
        },
        {
          title: "Period run",
          start: "2026-09-01T08:00:00Z",
          speed: 5,
          power: 700,
          sport: "running",
        },
        {
          title: "Future run",
          start: "2026-09-02T13:00:00Z",
          speed: 12,
          power: 1000,
          sport: "running",
        },
        {
          title: "Ride",
          start: "2026-09-01T09:00:00Z",
          speed: 20,
          power: 200,
          sport: "cycling",
        },
        {
          title: "Recorded zero",
          start: "2026-09-02T09:00:00Z",
          speed: 0,
          power: 0,
          sport: "cycling",
        },
      ] as const;
      return Promise.all(
        fixtures.map(async (f) => {
          const input: Activity = {
            title: f.title,
            start: Date.parse(f.start),
            sport: f.sport,
            duration: 200,
            distance: f.speed * 200,
            laps: [],
            samples: Array.from({ length: 201 }, (_, t) => ({
              t,
              distance: f.speed * t,
              speed: f.speed,
              power: f.power,
            })),
          };
          const { samples: _samples, ...summary } = input;
          return ctx.db.insert("activities", {
            athleteId,
            sourceId,
            title: input.title,
            start: input.start,
            sport: input.sport,
            duration: input.duration,
            distance: input.distance,
            summary,
            metrics: analyze(input),
            route: [],
            streamKey: "private",
            tags: [],
            gearIds: [],
            notes: "",
            excludedRecords: false,
            version: "test",
            createdAt: 0,
          });
        }),
      );
    });
    const calculate = (request: Record<string, unknown>) =>
      owner.action(api.analytics.calculate, {
        request: { tool: "getRecords", callId: "record", ...request },
      });
    const all = await calculate({
      record: "distance",
      recordScope: "all-time",
    });
    expect(all[0]).toMatchObject({
      value: 40,
      activityIds: [ids[0]],
      query: { sport: "running" },
    });
    const year = await calculate({
      record: "distance",
      recordScope: "current-year",
    });
    expect(year[0]).toMatchObject({
      value: 50,
      from: "2026-01-01",
      activityIds: [ids[1]],
    });
    const request = {
      record: "distance",
      recordScope: "period",
      period: {
        from: "2026-09-01",
        to: "2026-09-02",
        comparison: "explicit",
        compareFrom: "2026-01-01",
        compareTo: "2026-01-01",
      },
    };
    const period = await calculate(request);
    expect(period[0]).toMatchObject({
      value: 80,
      activityIds: [ids[2]],
      comparison: { value: 50 },
      comparisonActivityIds: [ids[1]],
    });
    expect(
      (await calculate({ record: "power", recordScope: "all-time" }))[0],
    ).toMatchObject({
      value: 200,
      activityIds: [ids[4]],
      query: { sport: "cycling" },
    });
    expect(
      (
        await calculate({
          record: "power",
          sport: "running",
          recordScope: "all-time",
        })
      )[0].value,
    ).toBe(900);
    const details = {
      id: ids[2],
      title: "Period run",
      notes: "Suspect distance",
      tags: [],
      gearIds: [],
      excludedRecords: true,
    };
    await expect(
      other.mutation(api.activities.update, details),
    ).rejects.toThrow("unavailable");
    await owner.mutation(api.activities.update, details);
    expect((await calculate(request))[0].value).toBeNull();
    const local = await owner.query(api.activities.get, { id: ids[2] });
    expect(local?.metrics.bestDistances[0].duration).toBe(80);
    await expect(
      other.query(api.activities.get, { id: ids[2] }),
    ).rejects.toThrow("unavailable");
    await owner.mutation(api.activities.update, {
      ...details,
      excludedRecords: false,
    });
    expect((await calculate(request))[0].value).toBe(80);
    const zero = await calculate({
      record: "power",
      period: { from: "2026-09-02", to: "2026-09-02" },
    });
    expect(zero[0].value).toBe(0);
    expect(zero.at(-1)?.value).toBeNull();
    const recordPage = await owner.action(api.analytics.records, {
      scope: "period",
      from: "2026-09-02",
      to: "2026-09-02",
    });
    expect(recordPage.power.map((r) => [r.value, r.activityIds])).toEqual(
      zero.map((r) => [r.value, r.activityIds]),
    );
    expect(
      (
        await other.action(api.analytics.records, { scope: "all-time" })
      ).power.every((r) => r.value === null),
    ).toBe(true);
    expect(
      (
        await other.action(api.analytics.calculate, {
          request: {
            tool: "getRecords",
            callId: "empty",
            recordScope: "all-time",
          },
        })
      ).every((e) => e.value === null),
    ).toBe(true);
    await expect(calculate({ recordScope: "period" })).rejects.toThrow(
      "explicit record period",
    );
    await expect(
      calculate({ ...request, recordScope: "all-time" }),
    ).rejects.toThrow("not both");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
