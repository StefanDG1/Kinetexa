import type { Activity } from "./model";
type DuplicateSummary = Pick<
  Activity,
  "sport" | "start" | "duration" | "distance"
>;
export const DUPLICATE_METHOD = "1.0.0";
export const DUPLICATE_SUGGESTION_THRESHOLD = 0.7;
export function duplicateAssessment(a: DuplicateSummary, b: DuplicateSummary) {
  const startDifferenceSeconds = Math.abs(a.start - b.start) / 1000;
  const durationDifferenceRatio =
    Math.abs(a.duration - b.duration) / Math.max(1, a.duration, b.duration);
  const distanceDifferenceRatio =
    a.distance !== undefined && b.distance !== undefined
      ? Math.abs(a.distance - b.distance) / Math.max(1, a.distance, b.distance)
      : null;
  const sameSport = a.sport === b.sport;
  const score =
    !sameSport || startDifferenceSeconds > 60
      ? 0
      : durationDifferenceRatio < 0.02 &&
          distanceDifferenceRatio !== null &&
          distanceDifferenceRatio < 0.02
        ? 0.95
        : durationDifferenceRatio < 0.1
          ? 0.7
          : 0;
  return {
    version: DUPLICATE_METHOD,
    score,
    suggestionThreshold: DUPLICATE_SUGGESTION_THRESHOLD,
    inputs: {
      sameSport,
      startDifferenceSeconds,
      durationDifferenceRatio,
      distanceDifferenceRatio,
    },
    reasons:
      score >= DUPLICATE_SUGGESTION_THRESHOLD
        ? [
            "The recorded sports match.",
            "Start times are no more than 60 seconds apart.",
            score === 0.95
              ? "Duration and distance each differ by less than 2%."
              : "Durations differ by less than 10%.",
          ]
        : [],
    caveat:
      "This rule score is not a probability. Route and sensor similarity are not evaluated. Only identical file hashes and session indices are automatically deduplicated; other recordings need your decision.",
  };
}
export function duplicateConfidence(a: DuplicateSummary, b: DuplicateSummary) {
  return duplicateAssessment(a, b).score;
}
