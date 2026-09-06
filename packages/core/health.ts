export const HEALTH_METRICS = {
  restingHr: { label: "Resting heart rate", unit: "bpm" },
  hrv: { label: "Heart-rate variability", unit: "ms" },
  sleep: { label: "Recorded sleep duration", unit: "seconds" },
  weight: { label: "Weight", unit: "kg" },
  vo2max: { label: "VO₂max estimate", unit: "ml/kg/min" },
  steps: { label: "Recorded steps", unit: "steps" },
} as const;
export type HealthKind = keyof typeof HEALTH_METRICS;
export type HealthReading = {
  date: string;
  kind: string;
  value: number;
  at?: number;
  unit?: string;
};
import { dayKey } from "./dashboard";
export function aggregateHealthFile<
  T extends { at: number; kind: string; value: number; unit: string },
>(samples: T[], timezone: string): T[] {
  const result = new Map<string, T>();
  for (const row of [...samples].sort((a, b) => a.at - b.at)) {
    const key = `${dayKey(row.at, timezone)}:${row.kind}`,
      old = result.get(key);
    if (!old) result.set(key, row);
    else if (row.kind === "sleep")
      result.set(key, { ...row, value: old.value + row.value });
    else if (row.kind === "steps")
      result.set(key, { ...row, value: Math.max(old.value, row.value) });
    else result.set(key, row);
  }
  return [...result.values()];
}
// A daily display chooses the latest physiological reading; accumulated step counters use the daily maximum.
// Multiple sources are never summed, which would double-count the same day.
export function dailyHealth<T extends HealthReading>(rows: T[]): T[] {
  const days = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))) {
    const key = `${row.date}:${row.kind}`,
      previous = days.get(key);
    if (!previous || row.kind !== "steps" || row.value >= previous.value)
      days.set(key, row);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
