import { type Activity, type Thresholds } from "./model";
import { normalize } from "./import";
import { analyze } from "./analytics";

export function analyzeInterval(
  activity: Activity,
  from: number,
  to: number,
  thresholds: Thresholds,
) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to > activity.duration ||
    from >= to
  )
    throw new Error("Choose an interval within the recorded activity.");
  const selected = activity.samples.filter((s) => s.t >= from && s.t <= to);
  if (selected.length < 2)
    return {
      requested: { from, to },
      actual: null,
      summary: null,
      metrics: null,
      sampleCount: selected.length,
      caveat:
        "At least two recorded samples are required; boundaries are not extrapolated.",
    };
  const first = selected[0],
    last = selected.at(-1)!,
    baseline = first.distance;
  const part = normalize({
    title: activity.title,
    sport: activity.sport,
    start: activity.start + first.t * 1000,
    duration: last.t - first.t,
    laps: [],
    samples: selected.map((s) => ({
      ...s,
      t: s.t - first.t,
      distance:
        baseline !== undefined &&
        s.distance !== undefined &&
        s.distance >= baseline
          ? s.distance - baseline
          : undefined,
    })),
  });
  const { samples: _samples, ...summary } = part;
  return {
    requested: { from, to },
    actual: { from: first.t, to: last.t },
    summary,
    metrics: analyze(part, thresholds),
    sampleCount: selected.length,
    caveat:
      "Uses recorded samples inside the selection. Actual boundaries are reported; missing sensor intervals are excluded and whole-activity summaries are not reused.",
  };
}
