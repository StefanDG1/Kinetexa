import type { Activity } from "./model";
export function duplicateConfidence(
  a: Pick<Activity, "sport" | "start" | "duration" | "distance">,
  b: Pick<Activity, "sport" | "start" | "duration" | "distance">,
) {
  if (a.sport !== b.sport || Math.abs(a.start - b.start) > 60000) return 0;
  const duration =
    Math.abs(a.duration - b.duration) / Math.max(1, a.duration, b.duration);
  const distance =
    a.distance !== undefined && b.distance !== undefined
      ? Math.abs(a.distance - b.distance) / Math.max(1, a.distance, b.distance)
      : 1;
  return duration < 0.02 && distance < 0.02 ? 0.95 : duration < 0.1 ? 0.7 : 0;
}
