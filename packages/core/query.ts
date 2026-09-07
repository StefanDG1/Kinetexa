import { z } from "zod";
import { dayKey } from "./dashboard";
const timestamp = z
  .number()
  .finite()
  .min(-8640000000000000)
  .max(8640000000000000);
export const querySchema = z
  .object({
    sport: z.string().max(80).optional(),
    timezone: z
      .string()
      .max(100)
      .refine((timeZone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid time zone.")
      .optional(),
    aiEligibleOnly: z.boolean().optional(),
    hasRoute: z.boolean().optional(),
    from: timestamp.optional(),
    to: timestamp.optional(),
    gear: z.string().max(256).optional(),
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
      "efficiency",
      "decoupling",
    ]),
    aggregate: z.enum(["count", "sum", "average", "min", "max", "median"]),
    group: z.enum(["day", "week", "month", "year", "sport", "gear", "none"]),
    visual: z.enum(["number", "line", "bar", "table"]),
  })
  .refine(
    (q) => q.from === undefined || q.to === undefined || q.from <= q.to,
    "The end date must follow the start date.",
  );
export type AnalysisQuery = z.infer<typeof querySchema>;
export type QueryActivity = {
  aiEligible?: boolean;
  route?: number[][];
  hasRoute?: boolean;
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
  if (q.metric === "efficiency" && !q.sport && q.group !== "sport")
    throw new Error(
      "Choose a sport or group by sport: efficiency uses different output units across sports.",
    );
  const value = (a: QueryActivity, k: string): number | undefined =>
    k === "count"
      ? 1
      : k === "load"
        ? (a.metrics.metrics?.load?.value ?? undefined)
        : k === "efficiency" || k === "decoupling"
          ? (a.metrics.metrics?.[k]?.value ?? undefined)
          : k === "weightedPower"
            ? (a.metrics.metrics?.weightedPower?.value ?? undefined)
            : ((a as any)[k] ?? a.summary[k]);
  const filtered = items.filter(
    (a) =>
      (!q.aiEligibleOnly || a.aiEligible === true) &&
      (q.hasRoute === undefined ||
        (a.hasRoute ?? Boolean(a.route && a.route.length > 1)) ===
          q.hasRoute) &&
      (!q.sport || a.sport === q.sport) &&
      (q.from === undefined || a.start >= q.from) &&
      (q.to === undefined || a.start <= q.to) &&
      (!q.gear || a.gearIds.includes(q.gear)) &&
      (!q.tag || a.tags.includes(q.tag)) &&
      q.filters.every((f) => {
        const n = value(a, f.field);
        return (
          typeof n === "number" &&
          Number.isFinite(n) &&
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
    const d = new Date(dayKey(a.start, q.timezone ?? "UTC"));
    let key = "Total";
    if (q.group === "sport") key = a.sport;
    else if (q.group !== "none" && q.group !== "gear") {
      if (q.group === "week")
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      key = d
        .toISOString()
        .slice(0, q.group === "year" ? 4 : q.group === "month" ? 7 : 10);
    }
    const n = value(a, q.metric);
    const keys =
      q.group === "gear"
        ? [...new Set(a.gearIds.length ? a.gearIds : ["Unassigned"])]
        : [key];
    for (const groupKey of keys) {
      const g = groups.get(groupKey) ?? { values: [], ids: [] };
      if (n !== undefined && n !== null && Number.isFinite(n)) g.values.push(n);
      g.ids.push(a._id);
      groups.set(groupKey, g);
    }
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
      return {
        label,
        value: result,
        count: g.ids.length,
        measuredCount: g.values.length,
        activityIds: g.ids,
      };
    });
}
