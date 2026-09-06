import { z } from "zod";
export const querySchema = z.object({
  sport: z.string().optional(),
  from: z.number().optional(),
  to: z.number().optional(),
  gear: z.string().optional(),
  tag: z.string().max(80).optional(),
  filters: z
    .array(
      z.object({
        field: z.enum([
          "duration",
          "distance",
          "elevationGain",
          "avgHr",
          "maxHr",
          "avgPower",
          "weightedPower",
          "avgSpeed",
        ]),
        op: z.enum(["gt", "lt", "eq"]),
        value: z.number().finite(),
      }),
    )
    .max(20),
  metric: z.enum([
    "count",
    "duration",
    "distance",
    "elevationGain",
    "avgHr",
    "maxHr",
    "avgPower",
    "weightedPower",
    "avgSpeed",
    "load",
  ]),
  aggregate: z.enum(["count", "sum", "average", "min", "max", "median"]),
  group: z.enum(["day", "week", "month", "year", "sport", "gear", "none"]),
  visual: z.enum(["number", "line", "bar", "table"]),
});
export type AnalysisQuery = z.infer<typeof querySchema>;
export type QueryActivity = {
  _id: string;
  sport: string;
  start: number;
  duration: number;
  distance?: number;
  summary: Record<string, unknown>;
  metrics: any;
  gearIds: string[];
  tags: string[];
};
export function runQuery(items: QueryActivity[], input: unknown) {
  const q = querySchema.parse(input);
  const value = (a: QueryActivity, k: string): number | undefined =>
    k === "count"
      ? 1
      : k === "load"
        ? (a.metrics.metrics?.load?.value ?? undefined)
        : k === "weightedPower"
          ? (a.metrics.metrics?.weightedPower?.value ?? undefined)
          : ((a as any)[k] ?? a.summary[k]);
  const filtered = items.filter(
    (a) =>
      (!q.sport || a.sport === q.sport) &&
      (q.from === undefined || a.start >= q.from) &&
      (q.to === undefined || a.start <= q.to) &&
      (!q.gear || a.gearIds.includes(q.gear)) &&
      (!q.tag || a.tags.includes(q.tag)) &&
      q.filters.every((f) => {
        const n = value(a, f.field);
        return (
          n !== undefined &&
          (f.op === "gt"
            ? n > f.value
            : f.op === "lt"
              ? n < f.value
              : n === f.value)
        );
      }),
  );
  const groups = new Map<string, { values: number[]; ids: string[] }>();
  for (const a of filtered) {
    const d = new Date(a.start);
    let key = "Total";
    if (q.group === "sport") key = a.sport;
    else if (q.group === "gear") key = a.gearIds.join(", ") || "Unassigned";
    else if (q.group !== "none") {
      if (q.group === "week")
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d
        .toISOString()
        .slice(0, q.group === "year" ? 4 : q.group === "month" ? 7 : 10);
    }
    const g = groups.get(key) ?? { values: [], ids: [] };
    const n = value(a, q.metric);
    if (n !== undefined && n !== null && Number.isFinite(n)) g.values.push(n);
    g.ids.push(a._id);
    groups.set(key, g);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, g]) => {
      const v = g.values.sort((a, b) => a - b),
        sum = v.reduce((a, b) => a + b, 0);
      const result =
        q.aggregate === "count"
          ? g.ids.length
          : !v.length
            ? null
            : q.aggregate === "sum"
              ? sum
              : q.aggregate === "average"
                ? sum / v.length
                : q.aggregate === "min"
                  ? v[0]
                  : q.aggregate === "max"
                    ? v.at(-1)!
                    : v.length % 2
                      ? v[Math.floor(v.length / 2)]
                      : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
      return { label, value: result, count: g.ids.length, activityIds: g.ids };
    });
}
