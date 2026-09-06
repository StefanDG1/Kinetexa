import { expect, it } from "vitest";
import { streamView } from "./stream-view";
import { querySchema, runQuery } from "./query";

it("preserves explicit and timed recording gaps through bounded stream reduction", () => {
  const samples = Array.from({ length: 10000 }, (_, i) => ({
    t: i + (i >= 3001 ? 60 : 0),
    hr: 140,
    breakBefore: i === 13,
    sourceFields: { privateDeviceField: "original-only" },
  }));
  const view = streamView(samples, 0, 20000);
  expect(view.length).toBeLessThanOrEqual(2000);
  expect(view[0].t).toBe(0);
  expect(view.at(-1)!.t).toBe(10059);
  expect(view.find((s) => s.t >= 13)?.breakBefore).toBe(true);
  expect(view.find((s) => s.t >= 3061)?.breakBefore).toBe(true);
  expect(view.filter((s) => s.breakBefore)).toHaveLength(2);
  expect(JSON.stringify(view)).not.toContain("privateDeviceField");
  expect(samples[13].breakBefore).toBe(true);
  expect(streamView(samples, 20, 25).map((s) => s.t)).toEqual([
    20, 21, 22, 23, 24, 25,
  ]);
});

it("rejects invalid query calendar inputs before storage or execution", () => {
  const query = {
    filters: [],
    metric: "count",
    aggregate: "count",
    group: "day",
    visual: "table",
  };
  for (const invalid of [
    { timezone: "Not/AZone" },
    { from: 20, to: 10 },
    { from: Infinity },
    { to: 9e15 },
  ])
    expect(querySchema.safeParse({ ...query, ...invalid }).success).toBe(false);
  expect(
    runQuery([], { ...query, timezone: "Europe/Berlin", from: 0, to: 0 }),
  ).toEqual([]);
});
