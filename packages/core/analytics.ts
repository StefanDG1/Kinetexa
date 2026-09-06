import {
  VERSION,
  type Activity,
  type Sample,
  type Thresholds,
  type Metric,
} from "./model";

export function weighted(samples: Sample[], key: keyof Sample) {
  let sum = 0,
    seconds = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t,
      value = samples[i - 1][key];
    if (dt > 0 && dt <= 30 && value !== undefined) {
      sum += value * dt;
      seconds += dt;
    }
  }
  return seconds ? sum / seconds : undefined;
}
export function zones(
  samples: Sample[],
  key: "hr" | "power" | "speed",
  bounds?: number[],
) {
  if (!bounds?.length) return null;
  const seconds = Array(bounds.length + 1).fill(0) as number[];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t,
      v = samples[i - 1][key];
    if (dt <= 0 || dt > 30 || v === undefined) continue;
    const index = bounds.findIndex((b) => v < b);
    seconds[index < 0 ? bounds.length : index] += dt;
  }
  return seconds.some((x) => x > 0) ? seconds : null;
}
function metric(
  value: number | null,
  unit: string,
  definition: string,
  formula: string,
  inputs: Metric["inputs"],
  caveat: string,
): Metric {
  return {
    value: value !== null && Number.isFinite(value) ? value : null,
    unit,
    definition,
    formula,
    inputs,
    caveat,
    version: VERSION,
  };
}
// Resample using elapsed seconds, with no interpolation over missing sensors or recording gaps.
export function seconds(
  samples: Sample[],
  key: "power" | "speed",
): (number | null)[] {
  const out: (number | null)[] = Array(
    Math.min(172800, Math.ceil(samples.at(-1)?.t ?? 0)),
  ).fill(null);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    if (b.t - a.t > 30 || a[key] === undefined) continue;
    for (let t = Math.ceil(a.t); t < Math.min(b.t, out.length); t++)
      out[t] = a[key]!;
  }
  return out;
}
export function bestDurations(
  samples: Sample[],
  key: "power" | "speed",
  durations = [5, 15, 30, 60, 300, 1200, 3600],
) {
  const values = seconds(samples, key);
  return durations.map((duration) => {
    let sum = 0,
      missing = 0,
      best: number | null = null,
      start = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) missing++;
      else sum += values[i]!;
      if (i >= duration) {
        if (values[i - duration] === null) missing--;
        else sum -= values[i - duration]!;
      }
      if (
        i >= duration - 1 &&
        missing === 0 &&
        (best === null || sum / duration > best)
      ) {
        best = sum / duration;
        start = i - duration + 1;
      }
    }
    return { duration, value: best, start };
  });
}
export function bestDistances(
  samples: Sample[],
  distances = [400, 1000, 1609.344, 5000, 10000, 21097.5, 42195],
) {
  // Segment counters prevent a candidate from crossing any missing/reset distance or time gap.
  const segment = samples.map(() => 0);
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1],
      b = samples[i];
    segment[i] =
      segment[i - 1] +
      Number(
        a.distance === undefined ||
          b.distance === undefined ||
          b.distance < a.distance ||
          b.t <= a.t ||
          b.t - a.t > 30,
      );
  }
  return distances.map((distance) => {
    let best: number | null = null,
      start = 0,
      j = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = samples[i];
      if (a.distance === undefined) continue;
      j = Math.max(j, i + 1);
      while (
        j < samples.length &&
        segment[j] === segment[i] &&
        (samples[j].distance === undefined ||
          samples[j].distance! - a.distance < distance)
      )
        j++;
      if (j >= samples.length) break;
      if (segment[j] !== segment[i]) continue;
      const end = samples[j],
        prev = samples[j - 1];
      if (
        prev.distance === undefined ||
        end.distance! <= prev.distance ||
        end.t - prev.t > 30
      )
        continue;
      const endTime =
        prev.t +
        ((a.distance + distance - prev.distance) /
          (end.distance! - prev.distance)) *
          (end.t - prev.t);
      const duration = endTime - a.t;
      if (duration > 0 && (best === null || duration < best)) {
        best = duration;
        start = a.t;
      }
    }
    return { distance, duration: best, start };
  });
}
export function analyze(activity: Activity, thresholds: Thresholds = {}) {
  const { samples } = activity;
  const hr = weighted(samples, "hr") ?? activity.avgHr;
  const power = weighted(samples, "power") ?? activity.avgPower;
  const speed = weighted(samples, "speed") ?? activity.avgSpeed;
  const bins = seconds(samples, "power");
  let sum = 0,
    missing = 0,
    fourth = 0,
    count = 0;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] === null) missing++;
    else sum += bins[i]!;
    if (i >= 30) {
      if (bins[i - 30] === null) missing--;
      else sum -= bins[i - 30]!;
    }
    if (i >= 29 && missing === 0) {
      fourth += (sum / 30) ** 4;
      count++;
    }
  }
  const wp = count >= 31 ? (fourth / count) ** 0.25 : null;
  const intensity = wp !== null && thresholds.ftp ? wp / thresholds.ftp : null;
  const reserve =
    hr !== undefined &&
    thresholds.maxHr &&
    thresholds.restHr !== undefined &&
    thresholds.maxHr > thresholds.restHr
      ? Math.max(
          0,
          Math.min(
            1,
            (hr - thresholds.restHr) / (thresholds.maxHr - thresholds.restHr),
          ),
        )
      : null;
  const trimp =
    reserve === null
      ? null
      : (activity.duration / 60) * reserve * 0.64 * Math.exp(1.92 * reserve);
  const output = activity.sport === "cycling" ? power : speed;
  const efficiency = output !== undefined && hr ? output / hr : null;
  const mid = activity.duration / 2;
  const parts = [
    samples.filter((s) => s.t <= mid),
    samples.filter((s) => s.t >= mid),
  ];
  const eff = parts.map((p) => {
    const h = weighted(p, "hr"),
      o = weighted(p, activity.sport === "cycling" ? "power" : "speed");
    return h && o !== undefined ? o / h : null;
  });
  const decoupling =
    activity.duration >= 1200 && eff[0] && eff[1]
      ? (100 * (eff[0] - eff[1])) / eff[0]
      : null;
  const load =
    intensity !== null
      ? (activity.duration / 3600) * intensity ** 2 * 100
      : (trimp ??
        (activity.sport === "running" &&
        speed !== undefined &&
        thresholds.thresholdSpeed
          ? (activity.duration / 3600) *
            (speed / thresholds.thresholdSpeed) ** 2 *
            100
          : null));
  const metrics = {
    load: metric(
      load,
      "points",
      "Training load",
      intensity !== null
        ? "hours × (weighted power / FTP)² × 100"
        : trimp !== null
          ? "minutes × HR reserve × 0.64 × exp(1.92 × HR reserve)"
          : "hours × (mean running speed / threshold speed)² × 100",
      {
        duration: activity.duration,
        ftp: thresholds.ftp ?? null,
        hr: hr ?? null,
        restHr: thresholds.restHr ?? null,
        maxHr: thresholds.maxHr ?? null,
        speed: speed ?? null,
        thresholdSpeed: thresholds.thresholdSpeed ?? null,
      },
      "Uses power first, then heart rate, then running pace when its threshold is set. These estimates are not interchangeable. HR uses a fixed Banister coefficient; pace is not adjusted for hills or weather.",
    ),
    trimp: metric(
      trimp,
      "points",
      "Heart-rate training impulse",
      "minutes × HR reserve × 0.64 × exp(1.92 × HR reserve)",
      {
        hr: hr ?? null,
        restHr: thresholds.restHr ?? null,
        maxHr: thresholds.maxHr ?? null,
      },
      "Uses mean HR and a fixed coefficient. Heat, medication and sensor error affect this estimate.",
    ),
    weightedPower: metric(
      wp,
      "W",
      "Weighted power",
      "Fourth root of the mean fourth power of complete 30-second moving averages",
      { windows: count },
      "Requires at least 60 seconds of recorded power. Gaps longer than 30 seconds are excluded.",
    ),
    intensity: metric(
      intensity,
      "ratio",
      "Power intensity",
      "weighted power / configured FTP",
      { ftp: thresholds.ftp ?? null },
      "A stale FTP changes this estimate.",
    ),
    variability: metric(
      wp !== null && power ? wp / power : null,
      "ratio",
      "Power variability",
      "weighted power / mean power",
      { power: power ?? null },
      "Includes recorded zero power, excludes missing data.",
    ),
    efficiency: metric(
      efficiency,
      activity.sport === "cycling" ? "W/bpm" : "m/s/bpm",
      "Aerobic efficiency",
      "mean output / mean heart rate",
      { output: output ?? null, hr: hr ?? null },
      "Compare similar terrain, conditions and workout intensity.",
    ),
    decoupling: metric(
      decoupling,
      "%",
      "Aerobic decoupling",
      "100 × (first-half efficiency − second-half efficiency) / first-half efficiency",
      { first: eff[0], second: eff[1] },
      "Meaningful for steady endurance work of at least 20 minutes. Hills, stops and intervals confound the result.",
    ),
  };
  return {
    metrics,
    hrZones: zones(samples, "hr", thresholds.hrZones),
    powerZones: zones(samples, "power", thresholds.powerZones),
    paceZones: zones(samples, "speed", thresholds.paceZones),
    powerCurve: bestDurations(samples, "power"),
    paceCurve: bestDurations(samples, "speed"),
    bestDistances: bestDistances(samples),
    thresholds,
    version: VERSION,
  };
}
export function fitness(
  daily: { date: string; load: number | null }[],
  chronicDays = 42,
  acuteDays = 7,
) {
  let chronic = 0,
    acute = 0;
  return daily.map((d) => {
    const form = chronic - acute;
    chronic += ((d.load ?? 0) - chronic) * (1 - Math.exp(-1 / chronicDays));
    acute += ((d.load ?? 0) - acute) * (1 - Math.exp(-1 / acuteDays));
    return { ...d, chronic, acute, form };
  });
}
