import { describe, it, expect } from "vitest";
import { evaluateTool, type ToolData, type ToolActivity } from "./ai-tools";
import { analyze } from "./analytics";
import {
  evidenceSchema,
  modelEvidence,
  resolvePeriod,
  planSchema,
  type AiTool,
} from "./ai";
import { findInsight } from "./ai-insights";
function activity(id: string, start: string, distance: number): ToolActivity {
  const canonical = {
    title: "Private",
    sport: "running" as const,
    start: Date.parse(start),
    duration: 3600,
    distance,
    samples: [],
    laps: [],
  };
  const metrics = analyze(canonical);
  metrics.metrics.load.value = 50;
  metrics.hrZones = [60, 120];
  metrics.powerCurve = [{ duration: 60, value: 250, start: 0 }];
  return {
    _id: id,
    sport: "running",
    start: canonical.start,
    duration: 3600,
    distance,
    summary: { avgHr: 150, elevationGain: 100 },
    metrics,
    gearIds: ["gear-private"],
    tags: [],
    excludedRecords: false,
    route: [
      [12, 48],
      [13, 49],
    ],
  };
}
const query = {
  filters: [],
  metric: "distance" as const,
  aggregate: "sum" as const,
  group: "none" as const,
  visual: "number" as const,
};
const data: ToolData = {
  activities: [
    activity("private-a", "2026-09-02T10:00:00Z", 10000),
    activity("private-b", "2026-08-26T10:00:00Z", 5000),
  ],
  health: [{ date: "2026-09-02", kind: "restingHr", value: 48, unit: "bpm" }],
  goals: [
    {
      _id: "goal-private",
      title: "Private",
      kind: "distance",
      target: 20,
      start: Date.parse("2026-09-01"),
      end: Date.parse("2026-09-08"),
    },
  ],
  gear: [
    {
      _id: "gear-private",
      name: "Private",
      servicedAt: Date.parse("2026-01-01"),
    },
  ],
  analyses: [{ _id: "analysis-private", name: "Private", query }],
  excluded: 0,
  now: Date.parse("2026-09-06T10:00:00Z"),
  timezone: "Europe/Berlin",
};
const period = {
  from: "2026-09-01",
  to: "2026-09-07",
  comparison: "previous" as const,
};
describe("deterministic AI tools", () => {
  const calls: AiTool[] = [
    { callId: "search", tool: "searchActivities", period, limit: 10 },
    { callId: "activity", tool: "getActivity", activityId: "private-a" },
    {
      callId: "compare",
      tool: "compareActivities",
      activityIds: ["private-a", "private-b"],
    },
    { callId: "load", tool: "getTrainingLoad", period },
    {
      callId: "fitness",
      tool: "getFitnessFormHistory",
      period,
      rollingDays: 7,
    },
    { callId: "records", tool: "getRecords", period, record: "power" },
    { callId: "zones", tool: "getZoneDistribution", period, zone: "hr" },
    {
      callId: "health",
      tool: "getHealthTrend",
      period,
      metrics: ["restingHr", "sleep"],
      rollingDays: 7,
    },
    {
      callId: "saved",
      tool: "runSavedAnalyticsQuery",
      analysisId: "analysis-private",
      period,
    },
    { callId: "query", tool: "runAdHocAnalyticsQuery", query, period },
    { callId: "maps", tool: "getMapSummary", period },
    { callId: "goal", tool: "getGoalProgress" },
    { callId: "gear", tool: "getGearUsage", period },
  ];
  it.each(calls)("$tool returns validated traceable evidence", (call) => {
    const results = evaluateTool(call, data);
    expect(results.length).toBeGreaterThan(0);
    results.forEach((e) =>
      expect(evidenceSchema.safeParse(e).success).toBe(true),
    );
    const projected = JSON.stringify(modelEvidence(results));
    expect(projected).not.toContain("private-");
    expect(projected).not.toContain('"route":[');
  });
  it("compares exact periods, preserves missing measurements and shows real goal progress", () => {
    const result = evaluateTool(calls[3], data).find(
      (e) => e.id === "load-distance",
    )!;
    expect(result.value).toBe(10000);
    expect(result.comparison).toMatchObject({
      value: 5000,
      delta: 5000,
      percent: 100,
      from: "2026-08-25",
      to: "2026-08-31",
    });
    const health = evaluateTool(calls[7], data);
    expect(health[0].value).toBe(48);
    expect(health[1].value).toBeNull();
    expect(health[1].caveats.join()).toContain("unavailable");
    expect(
      evaluateTool(calls[11], data).find((e) => e.id === "goal-0-progress")
        ?.value,
    ).toBe(50);
    const missing = structuredClone(data);
    missing.activities[0].distance = undefined;
    expect(
      evaluateTool(calls[3], missing).find((e) => e.id === "load-distance")
        ?.value,
    ).toBeNull();
  });
  it("rejects missing or restricted entity selectors rather than substituting another row", () => {
    expect(() =>
      evaluateTool(
        { callId: "x", tool: "getActivity", activityId: "someone-else" },
        data,
      ),
    ).toThrow("unavailable");
    expect(() =>
      evaluateTool(
        {
          callId: "x",
          tool: "runSavedAnalyticsQuery",
          analysisId: "someone-else",
        },
        data,
      ),
    ).toThrow("unavailable");
  });
  it("does not generate an automatic finding from sparse or missing evidence", () => {
    expect(findInsight(data)).toBeNull();
    const full = structuredClone(data);
    full.activities.push(
      activity("c", "2026-09-03", 12000),
      activity("d", "2026-08-27", 6000),
    );
    full.activities[0].metrics.metrics.load.value = 100;
    full.activities[2].metrics.metrics.load.value = 100;
    expect(findInsight(full)).not.toBeNull();
    full.excluded = 1;
    expect(findInsight(full)).toBeNull();
  });
});
it("resolves local DST days and calendar comparisons without UTC shifts or impossible leap dates", () => {
  const spring = resolvePeriod(
    { from: "2026-03-29", to: "2026-03-29", comparison: "none" },
    0,
    "Europe/Berlin",
  );
  expect(spring.end - spring.start).toBe(23 * 3600000);
  const autumn = resolvePeriod(
    { from: "2026-10-25", to: "2026-10-25", comparison: "none" },
    0,
    "Europe/Berlin",
  );
  expect(autumn.end - autumn.start).toBe(25 * 3600000);
  expect(
    resolvePeriod(
      { from: "2024-02-29", to: "2024-02-29", comparison: "year" },
      0,
      "UTC",
    ).comparison?.from,
  ).toBe("2023-02-28");
  expect(() =>
    resolvePeriod(
      { from: "2026-02-30", to: "2026-03-01", comparison: "none" },
      0,
      "UTC",
    ),
  ).toThrow();
  expect(() =>
    planSchema.parse({ calls: [{ tool: "executeSQL", callId: "x" }] }),
  ).toThrow();
  expect(() =>
    modelEvidence(
      evaluateTool({ callId: "x", tool: "getTrainingLoad", period }, data),
      1,
    ),
  ).toThrow("too large");
});
