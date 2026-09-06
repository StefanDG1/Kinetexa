import { fitness } from "./analytics";
import type { QueryActivity } from "./query";
export const WIDGETS = [
  ["timeline", "Fitness, fatigue and form"],
  ["weekly", "Week against week"],
  ["recent", "Recent sessions"],
  ["sports", "Sport distribution"],
  ["zones", "Heart-rate zones"],
  ["load", "Training load"],
  ["records", "Personal bests"],
  ["goals", "Goals"],
  ["consistency", "Consistency"],
  ["map", "Personal map"],
  ["insight", "Training insight"],
  ["analyses", "Saved analyses"],
] as const;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
export function dayKey(t: number, timezone = "UTC") {
  let formatter = dateFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (dateFormatters.size >= 32) dateFormatters.clear();
    dateFormatters.set(timezone, formatter);
  }
  return formatter.format(t);
}
export function dashboardData(
  items: QueryActivity[],
  from: number,
  to: number,
  timezone = "UTC",
) {
  const selected = items.filter((a) => a.start >= from && a.start <= to),
    sum = (rows: QueryActivity[]) => ({
      count: rows.length,
      distance: rows.some((a) => a.distance !== undefined)
        ? rows.reduce((n, a) => n + (a.distance ?? 0), 0)
        : null,
      duration: rows.reduce((n, a) => n + a.duration, 0),
      elevation: rows.some((a) => a.summary.elevationGain !== undefined)
        ? rows.reduce((n, a) => n + Number(a.summary.elevationGain ?? 0), 0)
        : null,
    });
  const map = new Map<
    string,
    { load: number; missing: number; count: number }
  >();
  for (const a of items) {
    const day = dayKey(a.start, timezone),
      d = map.get(day) ?? { load: 0, missing: 0, count: 0 };
    d.count++;
    if (a.metrics.metrics.load.value === null) d.missing++;
    else d.load += a.metrics.metrics.load.value;
    map.set(day, d);
  }
  const earliest = items.reduce((n, a) => Math.min(n, a.start), to),
    daily = [];
  const firstDay = dayKey(from, timezone),
    lastDay = dayKey(to, timezone);
  for (
    let t = Date.parse(dayKey(earliest, timezone));
    t <= Date.parse(lastDay);
    t += 86400000
  ) {
    const date = new Date(t).toISOString().slice(0, 10),
      day = map.get(date);
    daily.push({
      date,
      load: day?.load ?? 0,
      missing: day?.missing ?? 0,
      count: day?.count ?? 0,
    });
  }
  const curve = fitness(
    daily.map((d) => ({ ...d, load: d.missing ? null : d.load })),
  )
    .filter((d) => d.date >= firstDay && d.date <= lastDay)
    .map((d) => ({
      ...d,
      label: d.date,
      fitness: d.chronic,
      fatigue: d.acute,
    }));
  const now = new Date(dayKey(to, timezone)),
    weekday = (now.getUTCDay() + 6) % 7,
    weekStart = +now - weekday * 86400000;
  const weekKey = new Date(weekStart).toISOString().slice(0, 10),
    previousKey = new Date(weekStart - 7 * 86400000).toISOString().slice(0, 10);
  const currentWeek = sum(
      items.filter(
        (a) => dayKey(a.start, timezone) >= weekKey && a.start <= to,
      ),
    ),
    previousWeek = sum(
      items.filter(
        (a) =>
          dayKey(a.start, timezone) >= previousKey &&
          dayKey(a.start, timezone) < weekKey,
      ),
    );
  const sports = [...new Set(selected.map((a) => a.sport))].map((s) => ({
    label: s,
    value: selected
      .filter((a) => a.sport === s)
      .reduce((n, a) => n + a.duration / 3600, 0),
  }));
  const zoneCount = selected.reduce(
      (n, a) => Math.max(n, a.metrics.hrZones?.length ?? 0),
      0,
    ),
    zones = Array.from({ length: zoneCount }, (_, i) => ({
      label: `Zone ${i + 1}`,
      value: selected.reduce(
        (n, a) => n + (a.metrics.hrZones?.[i] ?? 0) / 60,
        0,
      ),
    }));
  const lastSeven = daily.slice(-7).map((d) => d.load);
  while (lastSeven.length < 7) lastSeven.unshift(0);
  const mean = lastSeven.reduce((a, b) => a + b, 0) / 7,
    sd = Math.sqrt(lastSeven.reduce((n, x) => n + (x - mean) ** 2, 0) / 7),
    monotony =
      sd > 0 && !daily.slice(-7).some((d) => d.missing) ? mean / sd : null,
    strain = monotony === null ? null : monotony * mean * 7;
  let streak = 0;
  let day = Date.parse(dayKey(to, timezone));
  if (!map.has(new Date(day).toISOString().slice(0, 10))) day -= 86400000;
  while (map.has(new Date(day).toISOString().slice(0, 10))) {
    streak++;
    day -= 86400000;
  }
  return {
    selected,
    totals: sum(selected),
    curve,
    currentWeek,
    previousWeek,
    sports,
    zones,
    monotony,
    strain,
    streak,
    activeDays: new Set(selected.map((a) => dayKey(a.start, timezone))).size,
    missingLoad: selected.filter((a) => a.metrics.metrics.load.value === null)
      .length,
  };
}
