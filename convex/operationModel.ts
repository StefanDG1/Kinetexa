import { v, type Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { recordProductEvent } from "./telemetryModel";

export const operationKind = v.union(
  v.literal("import"),
  v.literal("reprocess"),
  v.literal("export"),
  v.literal("deletion"),
  v.literal("email"),
  v.literal("ai"),
  v.literal("billing"),
  v.literal("webhook"),
);
export type OperationKind =
  | "import"
  | "reprocess"
  | "export"
  | "deletion"
  | "email"
  | "ai"
  | "billing"
  | "webhook";
export const operationPhases = v.array(
  v.object({
    name: v.union(
      v.literal("storage.read"),
      v.literal("storage.write"),
      v.literal("decode"),
      v.literal("parse.normalize"),
      v.literal("analytics"),
      v.literal("ai.plan"),
      v.literal("ai.tools"),
      v.literal("ai.explain"),
    ),
    startedAt: v.number(),
    endedAt: v.number(),
    failed: v.boolean(),
  }),
);
export const operationMeasures = v.object({
  phases: v.optional(operationPhases),
  bytes: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  costMicrousd: v.optional(v.number()),
  toolCalls: v.optional(v.number()),
});
export async function recordOperation(
  ctx: MutationCtx,
  data: {
    kind: OperationKind;
    service?: "stripe" | "resend";
    jobId: string;
    athleteId?: Id<"athletes">;
    outcome: string;
    startedAt?: number;
    attempt?: number;
    measures?: Infer<typeof operationMeasures>;
  },
) {
  const key = `${data.kind}:${data.jobId}:${data.attempt ?? 0}:${data.outcome}`;
  if (
    await ctx.db
      .query("operationalEvents")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
  )
    return;
  const previous = await ctx.db
    .query("operationalEvents")
    .withIndex("by_job", (q) => q.eq("jobId", data.jobId))
    .first();
  // Trace identifiers are correlation values, never authentication tokens.
  const hex = (length: number) =>
    Array.from({ length }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
  const event = {
    ...data,
    key,
    traceId: previous?.traceId ?? hex(32),
    spanId: hex(16),
    at: Date.now(),
  };
  await ctx.db.insert("operationalEvents", event);
  if (
    data.kind === "import" &&
    ["complete", "duplicate"].includes(data.outcome)
  ) {
    const id = ctx.db.normalizeId("sources", data.jobId),
      source = id ? await ctx.db.get(id) : null;
    if (source && !source.completedAt)
      await ctx.db.patch(source._id, { completedAt: event.at });
  }
  if (data.kind === "import" && data.outcome === "complete" && data.athleteId) {
    const athlete = await ctx.db.get(data.athleteId);
    if (athlete) {
      await recordProductEvent(ctx, athlete, "import_completed");
      const sourceId = ctx.db.normalizeId("sources", data.jobId);
      const firstActivities = await ctx.db
        .query("activities")
        .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
        .take(2);
      if (
        sourceId &&
        (await ctx.db.get(sourceId))?.activityId &&
        firstActivities.length === 1
      )
        await recordProductEvent(ctx, athlete, "first_activity_processed");
    }
  }
  console.info(
    JSON.stringify({
      event: "operation",
      kind: data.kind,
      service: data.service,
      jobId: data.jobId,
      traceId: event.traceId,
      spanId: event.spanId,
      outcome: data.outcome,
      durationMs:
        data.startedAt === undefined
          ? undefined
          : Math.max(0, event.at - data.startedAt),
      ...data.measures,
    }),
  );
}
