import { expect, it } from "vitest";
import { goalProgress } from "./goals";
import { evaluateTool, type ToolData, type ToolActivity } from "./ai-tools";
import { analyze } from "./analytics";
const start = Date.parse("2026-09-01"),
  now = Date.parse("2026-09-06"),
  end = Date.parse("2026-09-30");
const row = (id: string, at: number, distance?: number): ToolActivity => ({
  _id: id,
  start: at,
  sport: "running",
  duration: 1800,
  distance,
  summary: {},
  metrics: analyze({
    title: "Goal fixture",
    sport: "running",
    start: at,
    duration: 1800,
    laps: [],
    samples: [],
  }),
  gearIds: [],
  tags: [],
  excludedRecords: false,
});
const goal = { kind: "distance", target: 20, start, end };
it("distinguishes unavailable goal measurements from measured zero and partial recorded progress", () => {
  expect(goalProgress(goal, [row("missing", start)], now)).toMatchObject({
    current: null,
    percent: null,
    projected: null,
    measurementStatus: "unavailable",
    measuredCount: 0,
    missingCount: 1,
  });
  expect(goalProgress(goal, [row("zero", start, 0)], now)).toMatchObject({
    current: 0,
    measurementStatus: "complete",
    measuredCount: 1,
  });
  expect(
    goalProgress(
      goal,
      [row("measured", start, 5000), row("missing", start)],
      now,
    ),
  ).toMatchObject({
    current: 5,
    percent: 25,
    measurementStatus: "partial",
    measuredCount: 1,
    missingCount: 1,
  });
  expect(goalProgress(goal, [], now)).toMatchObject({
    current: 0,
    measurementStatus: "complete",
    activityCount: 0,
  });
});
it("uses only elapsed goal history as evidence and never attributes a manual result to unrelated activities", () => {
  const data: ToolData = {
    activities: [row("past", start, 5000), row("future", now + 86400000, 9000)],
    goals: [{ ...goal, _id: "goal", title: "Goal" }],
    gear: [],
    analyses: [],
    health: [],
    excluded: 0,
    now,
    timezone: "UTC",
  };
  const request = { tool: "getGoalProgress" as const, callId: "goal" };
  const results = evaluateTool(request, data, false),
    current = results.find((e) => e.id.endsWith("-current"))!;
  expect(current.value).toBe(5);
  expect(current.activityIds).toEqual(["past"]);
  expect(current.query?.to).toBe(now);
  expect(current.method?.version).toBeTruthy();
  data.goals[0] = {
    ...data.goals[0],
    kind: "raceTime",
    target: 1200,
    manualProgress: 1250,
  };
  const manual = evaluateTool(request, data, false).find((e) =>
    e.id.endsWith("-current"),
  )!;
  expect(manual.value).toBe(1250);
  expect(manual.activityIds).toEqual([]);
  expect(manual.sourceCount).toBe(0);
  expect(manual.query).toBeUndefined();
});
