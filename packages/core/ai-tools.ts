import {
  type AiTool,
  type DateRange,
  type Evidence,
  resolvePeriod,
  shiftDay,
} from "./ai";
import { type QueryActivity, type AnalysisQuery, runQuery } from "./query";
import { type Goal, goalProgress } from "./goals";
import { analyze, fitness } from "./analytics";
import { dayKey } from "./dashboard";
import { VERSION } from "./model";
import { dailyHealth } from "./health";

export type ToolActivity = Omit<QueryActivity, "metrics"> & {
  metrics: ReturnType<typeof analyze>;
  excludedRecords: boolean;
  route: number[][];
};
export type ToolData = {
  activities: ToolActivity[];
  health: { date: string; kind: string; value: number; unit?: string }[];
  goals: (Goal & { _id: string; title: string })[];
  gear: {
    _id: string;
    name: string;
    servicedAt: number;
    maintenanceKm?: number;
    maintenanceHours?: number;
  }[];
  analyses: { _id: string; name: string; query: AnalysisQuery }[];
  excluded: number;
  now: number;
  timezone: string;
};
const numeric = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) ? n : null;
const sum = (values: (number | null)[]) =>
  values.some((v) => v !== null)
    ? values.reduce<number>((a, b) => a + (b ?? 0), 0)
    : null;
const average = (values: (number | null)[]) => {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};
export function evaluateTool(call: AiTool, data: ToolData): Evidence[] {
  const period = resolvePeriod(
    "period" in call ? call.period : undefined,
    data.now,
    data.timezone,
  );
  const select = (range: DateRange) =>
    data.activities.filter(
      (a) =>
        a.start >= range.start &&
        a.start < range.end &&
        (!("sport" in call) || !call.sport || a.sport === call.sport),
    );
  let rows = select(period),
    before = period.comparison ? select(period.comparison) : [];
  const evidence: Evidence[] = [];
  data = {
    ...data,
    activities: data.activities.map((a) => ({ ...a, aiEligible: true })),
  };
  const emit = (
    key: string,
    label: string,
    value: number | null,
    unit: string,
    used = rows,
    comparison: number | null = null,
    caveats: string[] = [],
    extra: Partial<Evidence> = {},
  ) => {
    const ids = [...new Set(used.map((a) => a._id))];
    const e: Evidence = {
      id: `${call.callId}-${key}`,
      label,
      value,
      unit,
      from: period.from,
      to: period.to,
      activityIds: ids.slice(0, 25),
      sourceCount: ids.length,
      sourcesComplete: ids.length <= 25,
      caveats: [...caveats],
      ...extra,
    };
    if (!e.query && used.length)
      e.query = {
        sport: "sport" in call ? call.sport : undefined,
        from: used.reduce((n, a) => Math.min(n, a.start), period.start),
        to: Math.max(period.end - 1, ...used.map((a) => a.start)),
        aiEligibleOnly: true,
        filters: [],
        metric: "count",
        aggregate: "count",
        group: "none",
        visual: "table",
      };
    if (value === null)
      e.caveats.push(
        "This measurement is unavailable for the selected period.",
      );
    if (e.query)
      e.query = { ...e.query, aiEligibleOnly: true, timezone: data.timezone };
    if (data.excluded)
      e.caveats.push(
        "Sources without permission for external AI use were excluded before calculation.",
      );
    if (!e.sourcesComplete)
      e.caveats.push(
        "Direct activity links are a sample; use the source query for the full contributing history.",
      );
    if (period.comparison) {
      if (e.query)
        e.comparisonQuery = {
          ...e.query,
          from: period.comparison.start,
          to: period.comparison.end - 1,
        };
      if (comparison === null)
        e.caveats.push(
          "The comparison measurement is unavailable; a change cannot be calculated.",
        );
      const delta =
        value === null || comparison === null ? null : value - comparison;
      e.comparison = {
        from: period.comparison.from,
        to: period.comparison.to,
        value: comparison,
        delta,
        percent:
          delta === null || comparison === 0 || comparison === null
            ? null
            : (100 * delta) / Math.abs(comparison),
      };
    }
    evidence.push(e);
  };
  const totals = (selected: ToolActivity[]) => ({
    count: selected.length,
    distance: sum(selected.map((a) => numeric(a.distance))),
    duration: sum(selected.map((a) => a.duration)),
    load: sum(selected.map((a) => numeric(a.metrics.metrics?.load?.value))),
  });
  const measured = (
    key: string,
    label: string,
    unit: string,
    get: (a: ToolActivity) => number | null,
    kind: "sum" | "average" = "sum",
    used = rows,
    previous = before,
  ) => {
    const values = used.map(get),
      prior = previous.map(get),
      reduce = kind === "sum" ? sum : average;
    const missing = values.filter((v) => v === null).length;
    emit(
      key,
      label,
      reduce(values),
      unit,
      used,
      reduce(prior),
      missing
        ? [
            `${missing} activities lack this measurement; the result uses recorded values only.`,
          ]
        : [],
    );
  };
  switch (call.tool) {
    case "searchActivities": {
      rows = rows.filter(
        (a) =>
          (!call.tag || a.tags.includes(call.tag)) &&
          (!call.gearId || a.gearIds.includes(call.gearId)),
      );
      before = before.filter(
        (a) =>
          (!call.tag || a.tags.includes(call.tag)) &&
          (!call.gearId || a.gearIds.includes(call.gearId)),
      );
      emit(
        "count",
        "Matching activities",
        rows.length,
        "activities",
        rows,
        before.length,
        [],
        {
          query: {
            sport: call.sport,
            tag: call.tag,
            gear: call.gearId,
            from: period.start,
            to: period.end - 1,
            filters: [],
            metric: "count",
            aggregate: "count",
            group: "none",
            visual: "table",
          },
        },
      );
      for (const a of [...rows]
        .sort((a, b) => b.start - a.start)
        .slice(0, call.limit))
        emit(
          `activity-${evidence.length}`,
          `${a.sport} on ${dayKey(a.start, data.timezone)}`,
          a.duration,
          "seconds",
          [a],
          null,
          [],
          {
            link: `/activities/${a._id}`,
            from: dayKey(a.start, data.timezone),
            to: dayKey(a.start, data.timezone),
          },
        );
      break;
    }
    case "getActivity":
    case "compareActivities": {
      const ids =
        call.tool === "getActivity" ? [call.activityId] : call.activityIds;
      const selected = ids.map((id) =>
        data.activities.find((a) => a._id === id),
      );
      if (selected.some((a) => !a))
        throw new Error("An activity is unavailable or restricted.");
      selected.forEach((a, i) => {
        if (!a) return;
        const values = totals([a]);
        for (const key of ["distance", "duration", "load"] as const)
          emit(
            `${i}-${key}`,
            `${a.sport}: ${key}`,
            values[key],
            key === "distance"
              ? "metres"
              : key === "duration"
                ? "seconds"
                : "points",
            [a],
            null,
            [],
            {
              from: dayKey(a.start, data.timezone),
              to: dayKey(a.start, data.timezone),
              link: `/activities/${a._id}`,
            },
          );
        for (const key of ["efficiency", "decoupling"] as const) {
          const m = a.metrics.metrics?.[key];
          if (m)
            emit(
              `${i}-${key}`,
              m.definition,
              m.value,
              m.unit,
              [a],
              null,
              [m.caveat],
              {
                method: {
                  definition: m.definition,
                  formula: m.formula,
                  version: m.version,
                },
                from: dayKey(a.start, data.timezone),
                to: dayKey(a.start, data.timezone),
                link: `/activities/${a._id}`,
              },
            );
        }
      });
      break;
    }
    case "getTrainingLoad": {
      measured("load", "Measured training load", "points", (a) =>
        numeric(a.metrics.metrics?.load?.value),
      );
      measured("time", "Recorded training time", "seconds", (a) => a.duration);
      measured("distance", "Recorded distance", "metres", (a) =>
        numeric(a.distance),
      );
      emit(
        "count",
        "Activities",
        rows.length,
        "activities",
        rows,
        before.length,
      );
      const versions = [
        ...new Set(
          rows.map((a) => a.metrics.metrics?.load?.version).filter(Boolean),
        ),
      ];
      evidence[0].method = {
        definition: "Sum of available per-activity load",
        formula:
          "Sum of activity load calculated from power, heart-rate reserve or threshold pace; see source activities for inputs.",
        version: versions.join(", ") || VERSION,
      };
      evidence[0].caveats.push(
        "Load is a training estimate, not a medical measurement; mixed methods may not be directly comparable.",
      );
      break;
    }
    case "getFitnessFormHistory": {
      const curve = (range: DateRange) => {
        const prior = data.activities.filter(
          (a) => a.start < range.end && (!call.sport || a.sport === call.sport),
        );
        const earliest = prior.reduce(
            (n, a) => Math.min(n, a.start),
            range.start,
          ),
          first = dayKey(earliest, data.timezone);
        if ((Date.parse(range.to) - Date.parse(first)) / 86400000 > 36600)
          throw new Error("Fitness history exceeds the calculation limit.");
        const daily = new Map<string, { load: number; missing: boolean }>();
        for (const a of prior) {
          const key = dayKey(a.start, data.timezone),
            v = daily.get(key) ?? { load: 0, missing: false },
            load = numeric(a.metrics.metrics?.load?.value);
          v.load += load ?? 0;
          v.missing ||= load === null;
          daily.set(key, v);
        }
        const points = [];
        let missing = false;
        for (let d = first; d <= range.to; d = shiftDay(d, 1)) {
          const v = daily.get(d);
          missing ||= v?.missing ?? false;
          points.push({ date: d, load: v?.load ?? 0 });
        }
        return {
          points: fitness(points).filter((p) => p.date >= range.from),
          missing,
        };
      };
      const a = curve(period),
        b = period.comparison ? curve(period.comparison) : null;
      for (const key of ["chronic", "acute", "form"] as const) {
        const series = a.points.map((p, i, all) => ({
          date: p.date,
          value: average(
            all
              .slice(Math.max(0, i - call.rollingDays + 1), i + 1)
              .map((d) => d[key]),
          ),
        }));
        const comparisonSeries = b?.points.map((p, i, all) => ({
          date: p.date,
          value: average(
            all
              .slice(Math.max(0, i - call.rollingDays + 1), i + 1)
              .map((d) => d[key]),
          ),
        }));
        emit(
          key,
          key === "chronic" ? "Fitness" : key === "acute" ? "Fatigue" : "Form",
          a.missing ? null : (series.at(-1)?.value ?? null),
          "points",
          data.activities.filter(
            (a) =>
              a.start < period.end && (!call.sport || a.sport === call.sport),
          ),
          b?.missing ? null : (comparisonSeries?.at(-1)?.value ?? null),
          [
            `Rolling mean over up to ${call.rollingDays} days. Fitness starts at zero before recorded history.`,
            ...(a.missing
              ? [
                  "Missing activity load prevents a complete fitness estimate; inspect recorded load instead.",
                ]
              : []),
          ],
          {
            series: a.missing ? undefined : series,
            comparisonSeries: b?.missing ? undefined : comparisonSeries,
            method: {
              definition: "Exponential training-load model",
              formula:
                "Fitness: 42-day decay; fatigue: 7-day decay; form: prior-day fitness minus fatigue.",
              version: VERSION,
            },
          },
        );
      }
      break;
    }
    case "getRecords": {
      const valid = rows.filter((a) => !a.excludedRecords),
        old = before.filter((a) => !a.excludedRecords);
      const windows =
        call.record === "distance"
          ? [400, 1000, 1609.344, 5000, 10000, 21097.5, 42195]
          : [5, 15, 30, 60, 300, 1200, 3600];
      const find = (items: ToolActivity[], window: number) =>
        items
          .map((a) => ({
            a,
            value:
              call.record === "distance"
                ? a.metrics.bestDistances?.find((p) => p.distance === window)
                    ?.duration
                : (call.record === "power"
                    ? a.metrics.powerCurve
                    : a.metrics.paceCurve
                  )?.find((p) => p.duration === window)?.value,
          }))
          .filter(
            (x): x is { a: ToolActivity; value: number } =>
              numeric(x.value) !== null,
          )
          .sort((a, b) =>
            call.record === "distance" ? a.value - b.value : b.value - a.value,
          )[0];
      for (const window of windows) {
        const a = find(valid, window),
          b = find(old, window);
        emit(
          String(window),
          call.record === "distance"
            ? `Fastest ${window} metres`
            : `Best ${call.record} over ${window} seconds`,
          a?.value ?? null,
          call.record === "distance"
            ? "seconds"
            : call.record === "power"
              ? "watts"
              : "metres/second",
          a ? [a.a] : [],
          b?.value ?? null,
          [
            "Derived from complete recorded efforts; excluded activities do not compete.",
          ],
          { link: "/records", comparisonActivityIds: b ? [b.a._id] : [] },
        );
      }
      break;
    }
    case "getZoneDistribution": {
      const field =
        call.zone === "hr"
          ? "hrZones"
          : call.zone === "power"
            ? "powerZones"
            : "paceZones";
      const max = Math.max(
        0,
        ...rows.map((a) => a.metrics[field]?.length ?? 0),
        ...before.map((a) => a.metrics[field]?.length ?? 0),
      );
      if (!max)
        emit("zones", "Time in zones", null, "seconds", rows, null, [
          "Zone boundaries or sensor measurements are missing.",
        ]);
      for (let i = 0; i < max; i++)
        measured(`zone-${i}`, `${call.zone} zone ${i + 1}`, "seconds", (a) =>
          numeric(a.metrics[field]?.[i]),
        );
      evidence.forEach((e) =>
        e.caveats.push(
          "Zone totals use each activity's saved boundaries. Changed thresholds can change comparability.",
        ),
      );
      break;
    }
    case "getHealthTrend": {
      for (const kind of call.metrics) {
        const all = dailyHealth(data.health.filter((h) => h.kind === kind)),
          selected = all.filter(
            (h) => h.date >= period.from && h.date <= period.to,
          ),
          previous = period.comparison
            ? all.filter(
                (h) =>
                  h.date >= period.comparison!.from &&
                  h.date <= period.comparison!.to,
              )
            : [];
        const series = (items: typeof all, range: DateRange) => {
          const points = [];
          for (let d = range.from; d <= range.to; d = shiftDay(d, 1)) {
            const start = shiftDay(d, 1 - call.rollingDays);
            points.push({
              date: d,
              value: average(
                items
                  .filter((h) => h.date >= start && h.date <= d)
                  .map((h) => h.value),
              ),
            });
          }
          return points;
        };
        emit(
          kind,
          kind,
          average(selected.map((h) => h.value)),
          selected[0]?.unit ??
            previous[0]?.unit ??
            {
              restingHr: "bpm",
              hrv: "ms",
              weight: "kg",
              sleep: "seconds",
              vo2max: "ml/kg/min",
              steps: "steps",
            }[kind],
          [],
          average(previous.map((h) => h.value)),
          [
            `Mean of recorded daily measurements; rolling series uses up to ${call.rollingDays} calendar days. Missing dates are not zeros.`,
          ],
          {
            series: series(all, period),
            comparisonSeries: period.comparison
              ? series(all, period.comparison)
              : undefined,
            link: "/health",
          },
        );
      }
      break;
    }
    case "runSavedAnalyticsQuery":
    case "runAdHocAnalyticsQuery": {
      const saved =
        call.tool === "runSavedAnalyticsQuery"
          ? data.analyses.find((a) => a._id === call.analysisId)
          : null;
      if (call.tool === "runSavedAnalyticsQuery" && !saved)
        throw new Error("Saved analysis unavailable.");
      const query =
        call.tool === "runAdHocAnalyticsQuery" ? call.query : saved!.query;
      const main = call.period
        ? {
            ...query,
            timezone: data.timezone,
            from: period.start,
            to: period.end - 1,
          }
        : {
            ...query,
            timezone: data.timezone,
            from:
              query.from ??
              (saved
                ? data.activities.reduce(
                    (n, a) => Math.min(n, a.start),
                    data.now,
                  )
                : period.start),
            to: query.to ?? data.now,
          };
      const sourcePeriod = {
        from: dayKey(main.from, data.timezone),
        to: dayKey(main.to, data.timezone),
      };
      const comparisonLabel = (label: string) => {
        if (
          !period.comparison ||
          !["day", "week", "month", "year"].includes(query.group)
        )
          return label;
        if (query.group === "day" || query.group === "week")
          return shiftDay(
            label,
            (Date.parse(period.comparison.from) - Date.parse(period.from)) /
              86400000,
          );
        const current = new Date(period.from),
          previous = new Date(period.comparison.from),
          d = new Date(`${label}${query.group === "year" ? "-01-01" : "-01"}`);
        d.setUTCMonth(
          d.getUTCMonth() +
            12 * (previous.getUTCFullYear() - current.getUTCFullYear()) +
            previous.getUTCMonth() -
            current.getUTCMonth(),
        );
        return d.toISOString().slice(0, query.group === "year" ? 4 : 7);
      };
      const result = runQuery(data.activities, main),
        comparison = period.comparison
          ? runQuery(data.activities, {
              ...query,
              timezone: data.timezone,
              from: period.comparison.start,
              to: period.comparison.end - 1,
            })
          : [];
      if (!result.length)
        emit(
          "query",
          "Analysis result",
          null,
          query.metric,
          [],
          null,
          ["No matching activity records."],
          {
            query: main,
            ...sourcePeriod,
            link: saved ? `/analysis?selected=${saved._id}` : "/analysis",
          },
        );
      result.forEach((r, i) =>
        emit(
          String(i),
          `${query.metric}: ${r.label}`,
          r.value,
          query.aggregate === "count"
            ? "activities"
            : {
                count: "activities",
                distance: "metres",
                duration: "seconds",
                elevationGain: "metres",
                avgHr: "bpm",
                maxHr: "bpm",
                avgPower: "watts",
                weightedPower: "watts",
                avgSpeed: "metres/second",
                load: "points",
                efficiency: "output/bpm",
                decoupling: "percent",
              }[query.metric],
          data.activities.filter((a) => r.activityIds.includes(a._id)),
          comparison.find((c) => c.label === comparisonLabel(r.label))?.value ??
            null,
          [
            r.measuredCount === r.count
              ? "Every matching activity has the requested measurement."
              : `${r.measuredCount} of ${r.count} matching activities have the requested measurement. Only recorded measurements contribute.`,
          ],
          {
            query: main,
            ...sourcePeriod,
            link: saved ? `/analysis?selected=${saved._id}` : "/analysis",
          },
        ),
      );
      break;
    }
    case "getMapSummary": {
      const located = rows.filter((a) => a.route.length > 1),
        old = before.filter((a) => a.route.length > 1);
      emit(
        "routes",
        "Activities with recorded routes",
        located.length,
        "activities",
        located,
        old.length,
        ["Exact geometry and coordinates are not sent to the model."],
        { link: "/maps" },
      );
      measured(
        "distance",
        "Distance in mapped activities",
        "metres",
        (a) => numeric(a.distance),
        "sum",
        located,
        old,
      );
      evidence.forEach((e) => {
        if (e.query) e.query.hasRoute = true;
        if (e.comparisonQuery) e.comparisonQuery.hasRoute = true;
      });
      break;
    }
    case "getGoalProgress": {
      const selected = call.goalIds
        ? call.goalIds.map((id) => {
            const g = data.goals.find((g) => g._id === id);
            if (!g) throw new Error("Goal unavailable.");
            return g;
          })
        : data.goals;
      if (!selected.length)
        emit(
          "goals",
          "Goal progress",
          null,
          "percent",
          [],
          null,
          ["No goals have been created."],
          { link: "/goals" },
        );
      selected.forEach((g, i) => {
        const p = goalProgress(g, data.activities, data.now),
          used = data.activities.filter(
            (a) => a.start >= g.start && a.start <= g.end,
          ),
          unit =
            g.kind === "distance"
              ? "km"
              : g.kind === "duration"
                ? "hours"
                : g.kind === "raceTime"
                  ? "seconds"
                  : g.kind === "elevation"
                    ? "metres"
                    : "units";
        const missing = used.some((a) =>
            g.kind === "distance"
              ? a.distance === undefined
              : g.kind === "elevation"
                ? a.summary.elevationGain === undefined
                : false,
          ),
          caveats = missing
            ? [
                "Some contributing activities lack measurements; progress includes recorded values only.",
              ]
            : [];
        for (const [key, value, u] of [
          ["current", p.current, unit],
          ["target", g.target, unit],
          ["progress", p.percent, "percent"],
          ["projection", p.projected, unit],
        ] as const)
          emit(
            `${i}-${key}`,
            `Goal ${i + 1}: ${key}`,
            value,
            u,
            used,
            null,
            [
              ...caveats,
              ...(key === "projection"
                ? [
                    "Projection assumes the recorded rate continues; it is not a prediction.",
                  ]
                : []),
            ],
            {
              from: dayKey(g.start, data.timezone),
              to: dayKey(g.end, data.timezone),
              link: "/goals",
              query: {
                from: g.start,
                to: g.end,
                filters: [],
                metric: "count",
                aggregate: "count",
                group: "none",
                visual: "table",
              },
            },
          );
      });
      break;
    }
    case "getGearUsage": {
      if (!data.gear.length)
        emit(
          "gear",
          "Equipment usage",
          null,
          "metres",
          [],
          null,
          ["No equipment has been added."],
          { link: "/gear" },
        );
      data.gear.forEach((g, i) => {
        const used = rows.filter((a) => a.gearIds.includes(g._id)),
          old = before.filter((a) => a.gearIds.includes(g._id));
        measured(
          `${i}-distance`,
          `Equipment ${i + 1}: distance`,
          "metres",
          (a) => numeric(a.distance),
          "sum",
          used,
          old,
        );
        measured(
          `${i}-time`,
          `Equipment ${i + 1}: use`,
          "seconds",
          (a) => a.duration,
          "sum",
          used,
          old,
        );
        const since = data.activities.filter(
          (a) => a.start >= g.servicedAt && a.gearIds.includes(g._id),
        );
        emit(
          `${i}-service`,
          `Equipment ${i + 1}: distance since service`,
          totals(since).distance,
          "metres",
          since,
          null,
          ["Usage depends on equipment assignments."],
          { from: dayKey(g.servicedAt, data.timezone), link: "/gear" },
        );
        evidence
          .filter((e) => e.id.startsWith(`${call.callId}-${i}-`))
          .forEach((e) => {
            if (e.query) e.query.gear = g._id;
            if (e.comparisonQuery) e.comparisonQuery.gear = g._id;
          });
      });
      break;
    }
    default: {
      const exhaustive: never = call;
      throw new Error(`Unknown tool ${exhaustive}`);
    }
  }
  return evidence;
}
