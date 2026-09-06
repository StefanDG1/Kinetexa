import type { Sample } from "./model";

// Keep the API response bounded without joining recording segments when a break
// falls between retained samples. Full precision remains in the canonical file.
export function streamView(samples: Sample[], from: number, to: number) {
  const selected = samples.filter((s) => s.t >= from && s.t <= to);
  const step = Math.max(1, Math.ceil((selected.length - 1) / 1999));
  const result: Sample[] = [];
  let interrupted = false;
  for (let i = 0; i < selected.length; i++) {
    const sample = selected[i];
    interrupted ||=
      Boolean(sample.breakBefore) ||
      (i > 0 && sample.t - selected[i - 1].t > 30);
    if (i % step !== 0 && i !== selected.length - 1) continue;
    const { sourceFields: _sourceFields, ...view } = sample;
    if (interrupted) view.breakBefore = true;
    result.push(view);
    interrupted = false;
  }
  return result;
}
