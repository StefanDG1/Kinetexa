import type { QueryActivity } from "./query";
export const GOAL_PROGRESS_VERSION = "1.1.0";
export type Goal = {
  kind: string;
  target: number;
  start: number;
  end: number;
  manualProgress?: number;
};
export function goalProgress(
  goal: Goal,
  activities: QueryActivity[],
  now = Date.now(),
) {
  const rows = activities.filter(
    (a) => a.start >= goal.start && a.start <= Math.min(now, goal.end),
  );
  const manual = ["custom", "raceTime", "event"].includes(goal.kind);
  const values = manual
    ? []
    : rows
        .map((a) => {
          const value =
            goal.kind === "distance"
              ? a.distance
              : goal.kind === "duration"
                ? a.duration
                : goal.kind === "elevation"
                  ? a.summary.elevationGain
                  : 1;
          return typeof value === "number" &&
            Number.isFinite(value) &&
            value >= 0
            ? value
            : null;
        })
        .filter((value): value is number => value !== null);
  const missingCount = manual ? 0 : rows.length - values.length;
  const current = manual
    ? (goal.manualProgress ?? null)
    : rows.length && !values.length
      ? null
      : values.reduce((n, value) => n + value, 0) /
        (goal.kind === "distance" ? 1000 : goal.kind === "duration" ? 3600 : 1);
  const percent =
    current === null
      ? null
      : goal.kind === "raceTime"
        ? current > 0
          ? Math.min(100, (100 * goal.target) / current)
          : 0
        : goal.kind === "event"
          ? current >= 1
            ? 100
            : 0
          : (100 * current) / goal.target;
  const projected =
    !manual && current !== null && now > goal.start && now < goal.end
      ? (current * (goal.end - goal.start)) / (now - goal.start)
      : null;
  return {
    current,
    percent,
    projected,
    version: GOAL_PROGRESS_VERSION,
    activityCount: manual ? 0 : rows.length,
    measuredCount: values.length,
    missingCount,
    measurementStatus:
      current === null
        ? manual
          ? "unrecorded"
          : "unavailable"
        : missingCount > 0
          ? "partial"
          : "complete",
    daysLeft: Math.max(0, Math.ceil((goal.end - now) / 86400000)),
  };
}
