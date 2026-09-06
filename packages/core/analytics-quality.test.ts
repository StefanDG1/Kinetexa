import { it, expect } from "vitest";
import { analyze, fitness } from "./analytics";
import { analyzeInterval } from "./interval";
import { goalProgress } from "./goals";
import { dashboardData } from "./dashboard";
import type { Activity } from "./model";
const activity: Activity = {
  title: "Synthetic constant effort",
  sport: "cycling",
  start: Date.parse("2026-09-01"),
  duration: 3600,
  distance: 36000,
  laps: [],
  samples: Array.from({ length: 3601 }, (_, t) => ({
    t,
    power: 200,
    hr: 120,
    speed: 10,
    distance: t * 10,
  })),
};
it("matches independent closed-form load examples and never uses cycling FTP for running", () => {
  expect(
    analyze(activity, { restHr: 40, maxHr: 200 }).metrics.trimp.value,
  ).toBeCloseTo(50.14457228972386, 10);
  expect(analyze(activity, { ftp: 200 }).metrics.load.value).toBeCloseTo(
    100,
    10,
  );
  expect(
    analyze({ ...activity, sport: "running" }, { ftp: 200 }).metrics.load.value,
  ).toBeNull();
  expect(
    analyze({ ...activity, sport: "running" }, { ftp: 100, runningFtp: 200 })
      .metrics.load.value,
  ).toBeCloseTo(100, 10);
});
it("rejects extrapolated load and unpaired efficiency while preserving independently valid power efforts", () => {
  const partial = analyze(
    { ...activity, samples: activity.samples.slice(0, 61) },
    { ftp: 200, maxHr: 200, restHr: 40 },
  );
  expect(partial.metrics.weightedPower.value).toBeCloseTo(200);
  expect(partial.metrics.load.value).toBeNull();
  expect(partial.metrics.efficiency.value).toBeNull();
  expect(partial.coverage.powerSeconds).toBe(60);
  const separated = analyze({
    ...activity,
    samples: activity.samples.map((s) =>
      s.t < 1800 ? { t: s.t, power: 200 } : { t: s.t, hr: 120 },
    ),
  });
  expect(separated.metrics.efficiency.value).toBeNull();
  expect(separated.metrics.decoupling.value).toBeNull();
  const intervals = analyze({
    ...activity,
    samples: activity.samples.map((s) => ({
      ...s,
      power: s.t < 1800 ? 100 : 400,
    })),
  });
  expect(intervals.metrics.decoupling.value).toBeNull();
  expect(analyze(activity).metrics.decoupling.value).toBeCloseTo(0);
});
it("keeps missing load distinct from a rest day in fitness and monotony", () => {
  const series = fitness([
    { date: "2026-09-01", load: 100 },
    { date: "2026-09-02", load: null },
    { date: "2026-09-03", load: 0 },
  ]);
  expect(series[0].complete).toBe(true);
  expect(series[1].chronic).toBeNull();
  expect(series[2].form).toBeNull();
  const row = {
    _id: "test",
    gearIds: [],
    tags: [],
    sport: "cycling",
    start: activity.start,
    duration: activity.duration,
    distance: activity.distance,
    summary: activity,
    metrics: analyze(activity),
  };
  const dashboard = dashboardData(
    [row],
    activity.start,
    activity.start + 6 * 86400000,
  );
  expect(dashboard.curve.at(-1)?.chronic).toBeNull();
  expect(dashboard.monotony).toBeNull();
  expect(dashboard.strain).toBeNull();
});
it("analyzes only recorded samples within an interval without whole-activity fallbacks", () => {
  const result = analyzeInterval(activity, 600.5, 1200.5, { ftp: 200 });
  expect(result.actual).toEqual({ from: 601, to: 1200 });
  expect(result.summary).toMatchObject({
    duration: 599,
    distance: 5990,
    avgHr: 120,
    avgPower: 200,
  });
  expect(result.metrics?.metrics.load.value).toBeCloseTo(599 / 36);
  const absent = {
    ...activity,
    avgHr: 180,
    avgPower: 300,
    samples: activity.samples.map(({ t, distance }) => ({ t, distance })),
  };
  expect(
    analyzeInterval(absent, 0, 600, { ftp: 200 }).summary?.avgHr,
  ).toBeUndefined();
  expect(
    analyzeInterval(absent, 0, 600, { ftp: 200 }).metrics?.metrics.load.value,
  ).toBeNull();
  expect(analyzeInterval(activity, 1.1, 1.9, {}).actual).toBeNull();
  expect(() => analyzeInterval(activity, -1, 10, {})).toThrow("within");
});
it("leaves an unrecorded race result unavailable instead of claiming zero seconds", () => {
  const goal = { kind: "raceTime", start: 0, end: Date.now(), target: 1200 };
  expect(goalProgress(goal, [])).toMatchObject({
    current: null,
    percent: null,
    projected: null,
    measurementStatus: "unrecorded",
  });
  expect(goalProgress({ ...goal, manualProgress: 1000 }, []).percent).toBe(100);
});
