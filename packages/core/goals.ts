import type { QueryActivity } from "./query";
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
  const current = manual
    ? (goal.manualProgress ?? null)
    : rows.reduce(
        (n, a) =>
          n +
          (goal.kind === "distance"
            ? (a.distance ?? 0) / 1000
            : goal.kind === "duration"
              ? a.duration / 3600
              : goal.kind === "elevation"
                ? Number(a.summary.elevationGain ?? 0)
                : 1),
        0,
      );
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
    measurementStatus:
      current === null
        ? "unrecorded"
        : rows.some((a) =>
              goal.kind === "distance"
                ? a.distance === undefined
                : goal.kind === "elevation"
                  ? a.summary.elevationGain === undefined
                  : false,
            )
          ? "partial"
          : "complete",
    daysLeft: Math.max(0, Math.ceil((goal.end - now) / 86400000)),
  };
}
