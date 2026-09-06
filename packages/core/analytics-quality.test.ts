import { it, expect } from "vitest";
import { analyze, fitness, bestDistances } from "./analytics";
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
it("finds a best distance whose start lies between samples without crossing recording gaps", () => {
  const samples = [
    { t: 0, distance: 0 },
    { t: 30, distance: 90 },
    { t: 60, distance: 270 },
    { t: 90, distance: 570 },
    { t: 120, distance: 660 },
  ];
  // Between samples the speeds are 3, 6, 10 and 3 m/s. The fastest 400 m ends at 90 s.
  // Its first 100 m take 100/6 s, followed by 300/10 s, so its duration is 46 2/3 s.
  const best = bestDistances(samples, [400])[0];
  expect(best.duration).toBeCloseTo(100 / 6 + 300 / 10, 10);
  expect(best.start).toBeCloseTo(90 - (100 / 6 + 300 / 10), 10);
  expect(
    bestDistances(
      samples.map((s, i) => ({ ...s, breakBefore: i === 3 })),
      [400],
    )[0].duration,
  ).toBeNull();
});
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
it("publishes enough scalar inputs to independently reproduce derived activity metrics", () => {
  const { metrics: m } = analyze(activity, {
    ftp: 200,
    restHr: 40,
    maxHr: 200,
  });
  expect(m.weightedPower.value).toBeCloseTo(
    m.weightedPower.inputs.meanFourthPower! ** 0.25,
  );
  expect(m.intensity.value).toBeCloseTo(
    m.intensity.inputs.weightedPower! / m.intensity.inputs.ftp!,
  );
  expect(m.variability.value).toBeCloseTo(
    m.variability.inputs.weightedPower! / m.variability.inputs.power!,
  );
  expect(m.load.value).toBeCloseTo(
    (m.load.inputs.duration! / 3600) * m.load.inputs.intensity! ** 2 * 100,
  );
  const i = m.trimp.inputs;
  expect(m.trimp.value).toBeCloseTo(
    (i.duration! / 60) *
      i.reserve! *
      i.coefficient! *
      Math.exp(i.exponentCoefficient! * i.reserve!),
  );
  expect(m.efficiency.value).toBeCloseTo(
    m.efficiency.inputs.output! / m.efficiency.inputs.hr!,
  );
  expect(m.decoupling.value).toBeCloseTo(
    (100 * (m.decoupling.inputs.first! - m.decoupling.inputs.second!)) /
      m.decoupling.inputs.first!,
  );
  const missing = analyze({ ...activity, samples: [] });
  expect(missing.metrics.efficiency.inputs.output).toBeNull();
  expect(missing.metrics.weightedPower.inputs.meanFourthPower).toBeNull();
});
it("exposes a reproducible seven-day strain calculation and missing-day inputs", () => {
  const row = {
    _id: "load",
    gearIds: [],
    tags: [],
    sport: "cycling",
    start: activity.start,
    duration: activity.duration,
    summary: {},
    metrics: analyze(activity, { ftp: 200 }),
  };
  const result = dashboardData(
    [row],
    activity.start,
    activity.start + 6 * 86400000,
  );
  // One 100-point day and six rest days: population SD = 100 * sqrt(6) / 7.
  expect(result.monotony).toBeCloseTo(1 / Math.sqrt(6));
  expect(result.strain).toBeCloseTo(100 / Math.sqrt(6));
  expect(result.explanations.monotony.inputs).toMatchObject({
    day1Load: 100,
    day7Load: 0,
    missingDays: 0,
  });
  expect(result.explanations.strain.inputs.weeklyLoad).toBe(100);
  expect(result.explanations.fitness.inputs).toMatchObject({
    chronicDays: 42,
    acuteDays: 7,
  });
  const clipped = dashboardData(
    [row],
    activity.start + 3 * 86400000,
    activity.start + 6 * 86400000,
  );
  const first = clipped.curve[0];
  expect(first.previousChronic).toBeGreaterThan(0);
  expect(first.chronic).toBeCloseTo(
    first.previousChronic! +
      (first.load! - first.previousChronic!) *
        (1 - Math.exp(-1 / clipped.explanations.fitness.inputs.chronicDays)),
  );
  expect(first.form).toBeCloseTo(first.previousChronic! - first.previousAcute!);
  const missing = dashboardData(
    [{ ...row, metrics: analyze(activity) }],
    activity.start,
    activity.start + 6 * 86400000,
  );
  expect(missing.explanations.monotony.inputs).toMatchObject({
    day1Load: null,
    day7Load: 0,
    meanDailyLoad: null,
    missingDays: 1,
  });
  expect(missing.explanations.strain.inputs.weeklyLoad).toBeNull();
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
