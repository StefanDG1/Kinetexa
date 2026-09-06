import { v, ConvexError } from "convex/values";
import {
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import { VERSION } from "../packages/core/model";
import { dayKey } from "../packages/core/dashboard";

async function queue(ctx: MutationCtx, source: Doc<"sources">) {
  if (
    !source.hash ||
    !["complete", "partial"].includes(source.status) ||
    /\.zip$/i.test(source.name)
  )
    return false;
  if (["queued", "running"].includes(source.reprocessStatus ?? ""))
    return false;
  if (source.activityId) {
    const activity = await ctx.db.get(source.activityId);
    if (!activity || activity.sourceId !== source._id || activity.mergedInto)
      return false;
  } else {
    const earlier = await ctx.db
      .query("sources")
      .withIndex("by_hash", (q) =>
        q.eq("athleteId", source.athleteId).eq("hash", source.hash),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "complete"),
          q.lt(q.field("_creationTime"), source._creationTime),
        ),
      )
      .first();
    if (earlier) return false;
  }
  await ctx.db.patch(source._id, {
    reprocessStatus: "queued",
    reprocessError: undefined,
    reprocessRetries: 0,
  });
  await ctx.scheduler.runAfter(0, internal.reprocessingActions.source, {
    id: source._id,
  });
  return true;
}
export const request = mutation({
  args: { id: v.optional(v.id("sources")) },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx);
    if (id) {
      const source = await ctx.db.get(id);
      if (!source || source.athleteId !== a._id)
        throw new ConvexError("File unavailable.");
      await rateLimit(ctx, a._id, "reprocess-file", 100, 86400000);
      if (!(await queue(ctx, source)))
        throw new ConvexError(
          "This file is already processing or has no independent result to rebuild. Reprocess the original activity file or archive children.",
        );
    } else {
      await rateLimit(ctx, a._id, "reprocess", 4, 86400000);
      await ctx.scheduler.runAfter(0, internal.reprocessing.page, {
        athleteId: a._id,
        cursor: null,
      });
    }
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "reprocessing_requested",
      at: Date.now(),
    });
  },
});
export const page = internalMutation({
  args: { athleteId: v.id("athletes"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.athleteId);
    if (!a || a.status !== "active") return;
    const result = await ctx.db
      .query("sources")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .paginate({ cursor: args.cursor, numItems: 20 });
    for (const source of result.page) await queue(ctx, source);
    if (!result.isDone)
      await ctx.scheduler.runAfter(2000, internal.reprocessing.page, {
        athleteId: a._id,
        cursor: result.continueCursor,
      });
  },
});
const attemptArgs = { id: v.id("sources"), attempt: v.number() };
export const prepareSplit = internalMutation({
  args: { ...attemptArgs, count: v.number() },
  handler: async (ctx, { id, attempt, count }) => {
    const run = await current(ctx, id, attempt);
    if (
      !run ||
      !run.source.activityId ||
      !Number.isSafeInteger(count) ||
      count < 2
    )
      throw new ConvexError("Reprocessing attempt expired.");
    await ctx.db.patch(id, {
      partIndex: 0,
      ownsHealth: true,
      splitCount: count,
    });
  },
});
export const children = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const source = await ctx.db.get(id);
    if (!source || (await ctx.db.get(source.athleteId))?.status !== "active")
      return;
    for (const childId of source.childIds ?? []) {
      const child = await ctx.db.get(childId);
      if (child) await queue(ctx, child);
    }
  },
});
async function current(
  ctx: MutationCtx,
  id: Doc<"sources">["_id"],
  attempt: number,
) {
  const source = await ctx.db.get(id);
  if (
    !source ||
    source.reprocessStatus !== "running" ||
    source.reprocessAttempt !== attempt
  )
    return null;
  const athlete = await ctx.db.get(source.athleteId);
  return athlete?.status === "active" ? { source, athlete } : null;
}
export const claim = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const source = await ctx.db.get(id);
    if (!source || source.reprocessStatus !== "queued") return null;
    const athlete = await ctx.db.get(source.athleteId);
    if (!athlete || athlete.status !== "active") return null;
    const attempt = (source.reprocessAttempt ?? 0) + 1;
    await ctx.db.patch(id, {
      reprocessStatus: "running",
      reprocessAttempt: attempt,
    });
    await ctx.scheduler.runAfter(660000, internal.reprocessing.watchdog, {
      id,
      attempt,
    });
    return {
      source,
      attempt,
      thresholds: athlete.thresholds ?? {},
      timezone: athlete.timezone,
      healthEnabled: athlete.healthProcessing !== false,
      healthRevision: athlete.healthProcessingRevision ?? 0,
    };
  },
});
export const stageHealth = internalMutation({
  args: {
    ...attemptArgs,
    samples: v.array(
      v.object({
        at: v.number(),
        kind: v.string(),
        value: v.number(),
        unit: v.string(),
      }),
    ),
  },
  handler: async (ctx, { id, attempt, samples }) => {
    const run = await current(ctx, id, attempt);
    if (!run) throw new ConvexError("Reprocessing attempt expired.");
    if (run.athlete.healthProcessing === false) return;
    if (samples.length > 200)
      throw new ConvexError("Use bounded health batches.");
    for (const sample of samples) {
      const date = dayKey(sample.at, run.athlete.timezone);
      const previous = await ctx.db
        .query("health")
        .withIndex("by_source", (q) =>
          q.eq("sourceId", id).eq("date", date).eq("kind", sample.kind),
        )
        .filter((q) => q.eq(q.field("generation"), attempt))
        .first();
      const row = {
        ...sample,
        date,
        sourceId: id,
        source: run.source.name,
        athleteId: run.athlete._id,
        generation: attempt,
      };
      if (previous) await ctx.db.patch(previous._id, row);
      else await ctx.db.insert("health", row);
    }
  },
});
export const finish = internalMutation({
  args: {
    ...attemptArgs,
    healthRebuilt: v.boolean(),
    healthRevision: v.number(),
    parsed: v.optional(
      v.object({
        metrics: v.any(),
        summary: v.any(),
        route: v.array(v.array(v.number())),
        streamKey: v.string(),
      }),
    ),
    thresholds: v.any(),
    timezone: v.string(),
  },
  handler: async (
    ctx,
    {
      id,
      attempt,
      healthRebuilt,
      healthRevision,
      parsed,
      thresholds,
      timezone,
    },
  ) => {
    const run = await current(ctx, id, attempt);
    if (!run) return false;
    if (
      JSON.stringify(run.athlete.thresholds ?? {}) !==
        JSON.stringify(thresholds) ||
      run.athlete.timezone !== timezone
    ) {
      await ctx.db.patch(id, { reprocessStatus: "queued" });
      await ctx.scheduler.runAfter(1000, internal.reprocessingActions.source, {
        id,
      });
      return false;
    }
    if (parsed && run.source.activityId) {
      const old = await ctx.db.get(run.source.activityId);
      if (!old || old.sourceId !== id || old.mergedInto)
        throw new ConvexError("Activity changed during reprocessing.");
      await ctx.db.insert("metricHistory", {
        athleteId: old.athleteId,
        activityId: old._id,
        metrics: old.metrics,
        summary: old.summary,
        version: old.version,
        streamKey: old.streamKey,
        at: Date.now(),
      });
      await ctx.db.patch(old._id, {
        ...parsed,
        version: VERSION,
        sport: parsed.summary.sport,
        start: parsed.summary.start,
        duration: parsed.summary.duration,
        distance: parsed.summary.distance,
      });
    }
    await ctx.db.patch(id, {
      reprocessStatus: "complete",
      reprocessError: undefined,
      reprocessedAt: Date.now(),
      splitCount: undefined,
      parserVersion: VERSION,
      ...(healthRebuilt &&
      run.athlete.healthProcessing !== false &&
      healthRevision === (run.athlete.healthProcessingRevision ?? 0)
        ? { healthGeneration: attempt }
        : {}),
    });
    await ctx.scheduler.runAfter(0, internal.reprocessing.pruneHealth, {
      id,
      cursor: null,
    });
    return true;
  },
});
export const fail = internalMutation({
  args: { ...attemptArgs, message: v.string(), retryable: v.boolean() },
  handler: async (ctx, { id, attempt, message, retryable }) => {
    const run = await current(ctx, id, attempt);
    if (!run) return;
    const retries = run.source.reprocessRetries ?? 0,
      retry = retryable && retries < 3;
    await ctx.db.patch(id, {
      reprocessStatus: retry ? "queued" : "failed",
      reprocessRetries: retries + 1,
      reprocessError: message,
    });
    if (retry)
      await ctx.scheduler.runAfter(
        2000 * 2 ** retries,
        internal.reprocessingActions.source,
        { id },
      );
    await ctx.scheduler.runAfter(0, internal.reprocessing.pruneHealth, {
      id,
      cursor: null,
    });
  },
});
export const watchdog = internalMutation({
  args: attemptArgs,
  handler: async (ctx, { id, attempt }) => {
    const run = await current(ctx, id, attempt);
    if (!run) return;
    const retries = run.source.reprocessRetries ?? 0,
      retry = retries < 3;
    await ctx.db.patch(id, {
      reprocessStatus: retry ? "queued" : "failed",
      reprocessRetries: retries + 1,
      reprocessError: retry
        ? "Processing was interrupted. Retrying from the retained original."
        : "Reprocessing was interrupted repeatedly. Your previous results are preserved. Retry from import history.",
    });
    if (retry)
      await ctx.scheduler.runAfter(2000, internal.reprocessingActions.source, {
        id,
      });
    await ctx.scheduler.runAfter(0, internal.reprocessing.pruneHealth, {
      id,
      cursor: null,
    });
  },
});
export const pruneHealth = internalMutation({
  args: { id: v.id("sources"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { id, cursor }) => {
    const source = await ctx.db.get(id);
    if (!source) return;
    const rows = await ctx.db
      .query("health")
      .withIndex("by_source", (q) => q.eq("sourceId", id))
      .paginate({ cursor, numItems: 100 });
    for (const row of rows.page) {
      const generation = row.generation ?? 0;
      if (
        generation !== (source.healthGeneration ?? 0) &&
        !(
          source.reprocessStatus === "running" &&
          generation === source.reprocessAttempt
        )
      )
        await ctx.db.delete(row._id);
    }
    if (!rows.isDone)
      await ctx.scheduler.runAfter(0, internal.reprocessing.pruneHealth, {
        id,
        cursor: rows.continueCursor,
      });
  },
});
