import { expect, it } from "vitest";
import { calculateProductKpis, type KpiAthlete } from "./product-kpis";
const DAY = 86400000,
  from = Date.UTC(2026, 7, 1),
  to = from + 31 * DAY;
const athlete = (patch: Partial<KpiAthlete> = {}): KpiAthlete => ({
  createdAt: from,
  premium: false,
  activityCreatedAt: [from + 1000],
  sources: [
    {
      createdAt: from,
      receivedAt: from + 10,
      completedAt: from + 1000,
      status: "complete",
      supported: true,
      child: false,
    },
  ],
  events: [
    { at: from + 2000, event: "dashboard_viewed" },
    { at: from + 3000, event: "map_viewed" },
  ],
  ...patch,
});
it("measures activation only after the seven-day window and requires every uploaded source when fewer than five activities exist", () => {
  const incomplete = athlete({
    sources: [
      ...athlete().sources,
      {
        createdAt: from,
        receivedAt: from + 10,
        status: "failed",
        supported: true,
        child: false,
      },
    ],
  });
  const legacy = athlete({
    sources: [{ ...athlete().sources[0], completedAt: undefined }],
  });
  const recent = athlete({ createdAt: to - DAY, activityCreatedAt: [] });
  const result = calculateProductKpis(
    [athlete({ premium: true }), incomplete, legacy, recent],
    from,
    to,
    to,
  );
  expect(result.activation).toMatchObject({
    numerator: 1,
    denominator: 3,
    pending: 1,
    missingCompletionTime: 1,
  });
  expect(result.premiumConversion.percent).toBe(100);
  expect(result.timeToValue).toEqual({ samples: 3, medianMs: 1000 });
});
it("counts root upload outcomes once and separates pending work and unknown legacy upload timestamps", () => {
  const source = athlete().sources[0];
  const result = calculateProductKpis(
    [
      athlete({
        sources: [
          source,
          { ...source, child: true },
          { ...source, status: "partial" },
          { ...source, status: "running", completedAt: undefined },
          { ...source, receivedAt: undefined },
          { ...source, supported: false },
        ],
      }),
    ],
    from,
    to,
    to,
  );
  expect(result.importSuccess).toMatchObject({
    numerator: 1,
    denominator: 2,
    percent: 50,
    pending: 1,
    unknownUploadTime: 1,
  });
});
it("does not double count first-event milestones or combine Sunday and Monday actions into one week", () => {
  const sunday = Date.UTC(2026, 7, 2, 23),
    monday = sunday + 2 * 3600000;
  const result = calculateProductKpis(
    [
      athlete({
        events: [
          { at: sunday, event: "dashboard_viewed" },
          { at: sunday, event: "first_dashboard_viewed" },
          { at: monday, event: "activity_viewed" },
          { at: monday + 1, event: "metric_explanation_opened" },
          { at: monday + 2, event: "analysis_query_run" },
        ],
      }),
    ],
    from,
    to,
    to,
  );
  expect(result.weeklyEngagement).toEqual([
    { week: "2026-07-27", active: 1, engaged: 0 },
    { week: "2026-08-03", active: 1, engaged: 1 },
  ]);
  expect(result.explainabilityEngagement.percent).toBe(100);
});
it("uses the observed opening Premium cohort, counts cancellation once, and leaves empty denominators unknown", () => {
  const result = calculateProductKpis(
    [
      athlete({
        createdAt: from - DAY,
        events: [
          { event: "premium_activated", at: from - 100 },
          { event: "premium_canceled", at: from + 100 },
          { event: "premium_canceled", at: from + 200 },
        ],
      }),
      athlete({ createdAt: from - DAY, events: [] }),
    ],
    from,
    to,
    to,
  );
  expect(result.cancellation).toMatchObject({
    numerator: 1,
    denominator: 1,
    percent: 100,
    unknownOpening: 1,
  });
  expect(result.activation.percent).toBeNull();
  expect(result.explainabilityEngagement.percent).toBeNull();
  expect(() => calculateProductKpis([], from, to + 1, to)).toThrow("period");
  expect(() => calculateProductKpis([], from - DAY, to, to)).toThrow("period");
  expect(() => calculateProductKpis([], NaN, to, to)).toThrow("period");
});
