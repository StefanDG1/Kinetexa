import { z } from "zod";
import { querySchema } from "./query";
import { dayKey } from "./dashboard";

const date = z.iso.date();
export const periodSchema = z.object({
  from: date,
  to: date,
  comparison: z
    .enum(["none", "previous", "week", "month", "year", "explicit"])
    .default("none"),
  compareFrom: date.optional(),
  compareTo: date.optional(),
});
const scope = {
  period: periodSchema.optional(),
  sport: z
    .enum(["running", "cycling", "swimming", "walking", "other"])
    .optional(),
};
const base = { callId: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/) };
const handle = z.string().max(100);
export const toolSchema = z.discriminatedUnion("tool", [
  z.object({
    ...base,
    tool: z.literal("searchActivities"),
    ...scope,
    tag: z.string().max(80).optional(),
    gearId: handle.optional(),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  z.object({ ...base, tool: z.literal("getActivity"), activityId: handle }),
  z.object({
    ...base,
    tool: z.literal("compareActivities"),
    activityIds: z.array(handle).min(2).max(4),
  }),
  z.object({ ...base, tool: z.literal("getTrainingLoad"), ...scope }),
  z.object({
    ...base,
    tool: z.literal("getFitnessFormHistory"),
    ...scope,
    rollingDays: z.number().int().min(1).max(90).default(7),
  }),
  z.object({
    ...base,
    tool: z.literal("getRecords"),
    ...scope,
    record: z.enum(["power", "pace", "distance"]).default("power"),
  }),
  z.object({
    ...base,
    tool: z.literal("getZoneDistribution"),
    ...scope,
    zone: z.enum(["hr", "power", "pace"]).default("hr"),
  }),
  z.object({
    ...base,
    tool: z.literal("getHealthTrend"),
    period: periodSchema.optional(),
    metrics: z
      .array(z.enum(["restingHr", "hrv", "sleep", "weight", "vo2max", "steps"]))
      .min(1)
      .max(6),
    rollingDays: z.number().int().min(1).max(90).default(7),
  }),
  z.object({
    ...base,
    tool: z.literal("runSavedAnalyticsQuery"),
    analysisId: handle,
    period: periodSchema.optional(),
  }),
  z.object({
    ...base,
    tool: z.literal("runAdHocAnalyticsQuery"),
    query: querySchema,
    period: periodSchema.optional(),
  }),
  z.object({ ...base, tool: z.literal("getMapSummary"), ...scope }),
  z.object({
    ...base,
    tool: z.literal("getGoalProgress"),
    goalIds: z.array(handle).min(1).max(20).optional(),
  }),
  z.object({ ...base, tool: z.literal("getGearUsage"), ...scope }),
]);
export const planSchema = z
  .object({ calls: z.array(toolSchema).min(1).max(3) })
  .refine(
    (p) => new Set(p.calls.map((c) => c.callId)).size === p.calls.length,
    "Call identifiers must be unique.",
  );
export type AiTool = z.infer<typeof toolSchema>;
export type AiPlan = z.infer<typeof planSchema>;
export type PeriodInput = z.infer<typeof periodSchema>;
export type DateRange = {
  from: string;
  to: string;
  start: number;
  end: number;
};
export type Period = DateRange & { comparison?: DateRange };
const DAY = 86400000;
export function shiftDay(value: string, days: number) {
  return new Date(Date.parse(value) + days * DAY).toISOString().slice(0, 10);
}
function shiftCalendar(value: string, months: number) {
  const d = new Date(value),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return d.toISOString().slice(0, 10);
}
// Find the first instant of a local calendar date, including 23/25-hour DST days.
export function localDayStart(value: string, timezone: string) {
  date.parse(value);
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  let lo = Date.parse(value) - 2 * DAY,
    hi = Date.parse(value) + 2 * DAY;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (format.format(mid) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function resolvePeriod(
  input: PeriodInput | undefined,
  now: number,
  timezone: string,
): Period {
  const today = dayKey(now, timezone),
    p = input ?? { from: shiftDay(today, -27), to: today, comparison: "none" };
  periodSchema.parse(p);
  if (p.from > p.to || Date.parse(p.to) - Date.parse(p.from) > 36600 * DAY)
    throw new Error("Choose an ordered period of at most one hundred years.");
  const range = (from: string, to: string): DateRange => ({
    from,
    to,
    start: localDayStart(from, timezone),
    end: localDayStart(shiftDay(to, 1), timezone),
  });
  const result: Period = range(p.from, p.to);
  if (p.comparison !== "none") {
    let from: string, to: string;
    if (p.comparison === "explicit") {
      if (!p.compareFrom || !p.compareTo || p.compareFrom > p.compareTo)
        throw new Error("Choose a valid comparison period.");
      from = p.compareFrom;
      to = p.compareTo;
    } else if (p.comparison === "previous") {
      const days = (Date.parse(p.to) - Date.parse(p.from)) / DAY + 1;
      from = shiftDay(p.from, -days);
      to = shiftDay(p.from, -1);
    } else if (p.comparison === "week") {
      from = shiftDay(p.from, -7);
      to = shiftDay(p.to, -7);
    } else {
      const months = p.comparison === "year" ? -12 : -1;
      from = shiftCalendar(p.from, months);
      to = shiftCalendar(p.to, months);
      if (p.from.endsWith("-01") && shiftDay(p.to, 1).endsWith("-01"))
        to = shiftDay(shiftCalendar(shiftDay(p.to, 1), months), -1);
    }
    if (Date.parse(to) - Date.parse(from) > 36600 * DAY)
      throw new Error("Comparison period is too large.");
    result.comparison = range(from, to);
  }
  return result;
}
const pointSchema = z.object({
  date: z.string(),
  value: z.number().finite().nullable(),
});
export const evidenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().finite().nullable(),
  unit: z.string(),
  from: z.string(),
  to: z.string(),
  comparison: z
    .object({
      from: z.string(),
      to: z.string(),
      value: z.number().finite().nullable(),
      delta: z.number().finite().nullable(),
      percent: z.number().finite().nullable(),
    })
    .optional(),
  series: z.array(pointSchema).optional(),
  comparisonSeries: z.array(pointSchema).optional(),
  activityIds: z.array(z.string()).max(25),
  sourceCount: z.number().int(),
  sourcesComplete: z.boolean(),
  query: querySchema.optional(),
  comparisonQuery: querySchema.optional(),
  comparisonActivityIds: z.array(z.string()).max(25).optional(),
  link: z.string().optional(),
  caveats: z.array(z.string()),
  method: z
    .object({
      definition: z.string(),
      formula: z.string(),
      version: z.string(),
    })
    .optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
export const explanationSchema = z.object({
  summary: z.string().min(1).max(3000),
  evidenceIds: z.array(z.string()).min(1).max(40),
});
export function medicalQuestion(q: string) {
  return /diagnos|medicat|prescri|chest pain|emergency|heart attack|suicid|treatment|faint(ed|ing)|can.t breathe|cure\b|symptoms|stroke|seizure|overdose|shortness of breath|durere.*piept|schmerzen.*brust/i.test(
    q,
  );
}
export const MEDICAL_BOUNDARY =
  "Kinetexa can describe training data, but cannot assess symptoms, diagnose conditions or recommend treatment. A qualified clinician can assess health concerns. For urgent symptoms, contact emergency services.";
export function privateQuestion(q: string) {
  return /other (athlete|user|people)|another (athlete|user)|everyone.?s|api key|password|secret|home (address|coordinates)|raw gps|exact.*coordinates/i.test(
    q,
  );
}
export const PRIVATE_BOUNDARY =
  "Kinetexa cannot disclose another athlete's private data or credentials. Exact routes stay out of AI processing; you can inspect your own recordings on the Activities and Maps pages.";
export function validateExplanation(
  input: unknown,
  evidence: { id: string; value: number | null }[],
) {
  const result = explanationSchema.parse(input),
    ids = new Set(evidence.map((e) => e.id));
  if (result.evidenceIds.some((id) => !ids.has(id)))
    throw new Error("Evidence reference is not available.");
  if (
    /\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|twice|double[ds]?|half|quarter|first|second|third)\b/i.test(
      result.summary,
    )
  )
    throw new Error("Numerical claims must come from the evidence table.");
  if (
    /you (have|suffer from)|diagnos|prescrib|guaranteed|certainly cured|you should take|stop taking/i.test(
      result.summary,
    )
  )
    throw new Error("Medical certainty is not allowed.");
  return result;
}
export function modelEvidence(evidence: Evidence[], maxBytes = 24000) {
  const facts = evidence.map(
    ({
      id,
      label,
      value,
      unit,
      from,
      to,
      comparison,
      series,
      comparisonSeries,
      caveats,
      method,
    }) => ({
      id,
      label,
      value,
      unit,
      from,
      to,
      comparison,
      series,
      comparisonSeries,
      caveats,
      method,
    }),
  );
  const json = JSON.stringify(facts);
  if (new TextEncoder().encode(json).length > maxBytes)
    throw new Error(
      "Evidence is too large. Choose a shorter period or fewer metrics.",
    );
  return facts;
}
