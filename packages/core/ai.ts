import { z } from "zod";
export const planSchema = z.object({
  tool: z.enum([
    "searchActivities",
    "getTrainingLoad",
    "getRecords",
    "getZoneDistribution",
    "getMapSummary",
    "getGoalProgress",
    "getGearUsage",
    "getHealthTrend",
  ]),
  sport: z
    .enum(["running", "cycling", "swimming", "walking", "other"])
    .optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export const explanationSchema = z.object({
  summary: z.string().max(3000),
  evidenceIds: z.array(z.string()).max(20),
});
export function medicalQuestion(q: string) {
  return /diagnos|medicat|prescri|chest pain|emergency|heart attack|suicid|treatment/i.test(
    q,
  );
}
export function validateExplanation(
  input: unknown,
  evidence: { id: string; value: number | null }[],
) {
  const result = explanationSchema.parse(input),
    ids = new Set(evidence.map((e) => e.id));
  if (result.evidenceIds.some((id) => !ids.has(id)))
    throw new Error("Evidence reference is not available.");
  // Numerical claims are rendered by the application from evidence. The model supplies qualitative explanation only.
  if (/\d/.test(result.summary))
    throw new Error("Numerical claims must come from the evidence table.");
  if (
    /you (have|suffer from)|diagnos|prescrib|guaranteed|certainly cured/i.test(
      result.summary,
    )
  )
    throw new Error("Medical certainty is not allowed.");
  return result;
}
