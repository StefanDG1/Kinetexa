const DAY = 86400000;
export type KpiEvent = { event: string; at: number };
export type KpiSource = {
  createdAt: number;
  receivedAt?: number;
  completedAt?: number;
  status: string;
  child: boolean;
  supported: boolean;
};
export type KpiAthlete = {
  createdAt: number;
  premium: boolean;
  activityCreatedAt: number[];
  sources: KpiSource[];
  events: KpiEvent[];
};
const actions = new Set([
  "dashboard_viewed",
  "activity_viewed",
  "map_viewed",
  "analysis_query_run",
  "analysis_saved",
  "ai_question_asked",
  "goal_created",
  "calendar_workout_planned",
]);
export function validateKpiPeriod(from: number, to: number, now: number) {
  if (
    ![from, to, now].every(Number.isFinite) ||
    from >= to ||
    to > now ||
    to - from > 31 * DAY ||
    from < now - 90 * DAY
  )
    throw new Error(
      "Choose an ordered period of at most 31 days within the retained last 90 days, ending no later than now.",
    );
}
function rate(numerator: number, denominator: number) {
  return {
    numerator,
    denominator,
    percent: denominator ? (100 * numerator) / denominator : null,
  };
}
function monday(at: number) {
  const day = new Date(at);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

/** Aggregates only the consenting cohort supplied by the internal reader. No identities leave this function. */
export function calculateProductKpis(
  athletes: KpiAthlete[],
  from: number,
  to: number,
  now: number,
) {
  validateKpiPeriod(from, to, now);
  let matured = 0,
    pending = 0,
    activated = 0,
    unknownCompletion = 0,
    converted = 0;
  let successfulImports = 0,
    failedImports = 0,
    pendingImports = 0,
    unknownUploadTime = 0;
  let active = 0,
    explained = 0,
    openingPremium = 0,
    canceled = 0,
    unknownOpening = 0;
  const ttv: number[] = [],
    weeks = new Map<string, { active: number; engaged: number }>();
  for (const a of athletes) {
    const events = a.events.filter((e) => e.at < to);
    const current = events.filter((e) => e.at >= from);
    if (a.createdAt >= from && a.createdAt < to) {
      const deadline = a.createdAt + 7 * DAY;
      const activityTimes = a.activityCreatedAt.filter(
        (at) => at >= a.createdAt && at <= deadline && at < to,
      );
      const first = a.activityCreatedAt
        .filter((at) => at >= a.createdAt && at < to)
        .sort((x, y) => x - y)[0];
      if (first !== undefined) ttv.push(first - a.createdAt);
      if (deadline > to) pending++;
      else {
        matured++;
        const sources = a.sources.filter(
          (s) => !s.child && s.createdAt <= deadline,
        );
        const completed = sources.filter(
          (s) => s.completedAt !== undefined && s.completedAt <= deadline,
        );
        const unknown = sources.some(
          (s) =>
            ["complete", "duplicate"].includes(s.status) &&
            s.completedAt === undefined,
        );
        if (unknown) unknownCompletion++;
        const observed = events.filter(
          (e) => e.at >= a.createdAt && e.at <= deadline,
        );
        const enoughActivities =
          activityTimes.length >= 5 ||
          (activityTimes.length > 0 &&
            sources.length > 0 &&
            completed.length === sources.length);
        if (
          completed.length &&
          enoughActivities &&
          observed.some((e) => e.event === "dashboard_viewed") &&
          observed.some((e) =>
            ["activity_viewed", "map_viewed"].includes(e.event),
          )
        ) {
          activated++;
          if (a.premium) converted++;
        }
      }
    }
    for (const s of a.sources.filter((s) => !s.child && s.supported)) {
      if (s.receivedAt === undefined) {
        if (
          s.status !== "awaiting-upload" &&
          s.createdAt >= from &&
          s.createdAt < to
        )
          unknownUploadTime++;
        continue;
      }
      if (s.receivedAt < from || s.receivedAt >= to) continue;
      if (["complete", "duplicate"].includes(s.status)) successfulImports++;
      else if (["failed", "partial"].includes(s.status)) failedImports++;
      else pendingImports++;
    }
    const meaningful = current.filter((e) => actions.has(e.event));
    if (meaningful.length) {
      active++;
      if (current.some((e) => e.event === "metric_explanation_opened"))
        explained++;
    }
    const userWeeks = new Map<string, number>();
    for (const e of meaningful)
      userWeeks.set(monday(e.at), (userWeeks.get(monday(e.at)) ?? 0) + 1);
    for (const [week, count] of userWeeks) {
      const total = weeks.get(week) ?? { active: 0, engaged: 0 };
      total.active++;
      if (count >= 2) total.engaged++;
      weeks.set(week, total);
    }
    if (a.createdAt < from) {
      const opening = events
        .filter(
          (e) =>
            e.at < from &&
            ["premium_activated", "premium_canceled"].includes(e.event),
        )
        .sort((x, y) => y.at - x.at)[0];
      if (!opening) unknownOpening++;
      else if (opening.event === "premium_activated") {
        openingPremium++;
        if (current.some((e) => e.event === "premium_canceled")) canceled++;
      }
    }
  }
  ttv.sort((x, y) => x - y);
  return {
    period: { from, to, observedAt: now },
    consentingAthletes: athletes.length,
    activation: {
      ...rate(activated, matured),
      pending,
      missingCompletionTime: unknownCompletion,
      interpretation:
        "Observed lower bound. Fewer than five means all uploaded root sources completed; availability outside Kinetexa is unknown. Missing view observations are not proof of inactivity.",
    },
    timeToValue: {
      samples: ttv.length,
      medianMs: ttv.length
        ? (ttv[Math.floor((ttv.length - 1) / 2)] +
            ttv[Math.floor(ttv.length / 2)]) /
          2
        : null,
    },
    importSuccess: {
      ...rate(successfulImports, successfulImports + failedImports),
      pending: pendingImports,
      unknownUploadTime,
      interpretation:
        "Current outcomes of supported root uploads received in the period. Archives count once; partial archives fail. Pending imports are excluded from the terminal denominator.",
    },
    weeklyEngagement: [...weeks]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, values]) => ({ week, ...values })),
    explainabilityEngagement: rate(explained, active),
    premiumConversion: {
      ...rate(converted, activated),
      interpretation:
        "Currently Premium among the observed activated signup cohort, not historical paid conversion.",
    },
    cancellation: {
      ...rate(canceled, openingPremium),
      unknownOpening,
      interpretation:
        "Cancellation during the selected period among Premium accounts observed at its start. Select a complete UTC calendar month for monthly churn.",
    },
    syncReliability: {
      percent: null,
      reason: "No approved persistent provider connector is operating.",
    },
    aiGroundedAnswerSuccess: {
      percent: null,
      reason:
        "Runtime completion is not a quality score. Combine evaluation evidence and user feedback before reporting this KPI.",
    },
    ossSignal: {
      value: null,
      reason: "Open Solo packaging follows the hosted V1 phase.",
    },
  };
}
