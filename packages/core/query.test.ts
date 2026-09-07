import { it, expect } from "vitest";
import { runQuery, type QueryActivity } from "./query";
it("groups each gear item once and excludes missing measurements from numeric filters", () => {
  const base: QueryActivity = {
    _id: "one",
    sport: "cycling",
    start: 0,
    duration: 60,
    distance: 100,
    gearIds: ["bike", "wheel", "bike"],
    tags: [],
    summary: { avgHr: null },
    metrics: {},
  };
  const q = {
    filters: [],
    metric: "distance",
    aggregate: "sum",
    group: "gear",
    visual: "table",
  };
  const rows = [
    base,
    { ...base, _id: "two", distance: 200, gearIds: ["wheel", "bike"] },
  ];
  expect(runQuery(rows, q).map((r) => [r.label, r.value, r.count])).toEqual([
    ["bike", 300, 2],
    ["wheel", 300, 2],
  ]);
  expect(
    runQuery(rows, {
      ...q,
      filters: [{ field: "avgHr", op: "lt", value: 100 }],
    }),
  ).toEqual([]);
});
