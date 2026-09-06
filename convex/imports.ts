import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { duplicateConfidence } from "../packages/core/dedup";
import { VERSION } from "../packages/core/model";
import { rateLimit } from "./limits";
import { dayKey } from "../packages/core/dashboard";
import { paginationOptsValidator } from "convex/server";
import { publishFacts } from "./activityFacts";
import { recordOperation } from "./operationModel";
import { recordProductEvent } from "./telemetryModel";
const currentAttempt = (source: Doc<"sources">, attempt?: number) =>
  attempt === undefined ||
  (source.status === "running" && source.attempts === attempt);

export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("sources")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        numItems: Math.min(100, Math.max(1, args.paginationOpts.numItems)),
        maximumBytesRead: 4 * 1024 * 1024,
      });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    const rows = await ctx.db
      .query("sources")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .take(501);
    if (rows.length > 500)
      throw new ConvexError("Use paginated import history for this account.");
    return rows;
  },
});
export const reserve = mutation({
  args: { name: v.string(), bytes: v.number(), nonce: v.string() },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "upload", 100);
    if (
      !/\.(fit|tcx|gpx|zip)$/i.test(args.name) ||
      args.name.length > 240 ||
      !Number.isSafeInteger(args.bytes) ||
      args.bytes < 1 ||
      args.bytes > (/\.zip$/i.test(args.name) ? 128 : 32) * 1024 * 1024 ||
      !/^[a-f0-9-]{36}$/.test(args.nonce)
    )
      throw new ConvexError("Choose a supported file within the upload limit.");
    return ctx.db.insert("sources", {
      athleteId: a._id,
      name: args.name,
      key: `${a._id}/uploads/${args.nonce}`,
      uploadKey: `${a._id}/uploads/${args.nonce}`,
      bytes: args.bytes,
      status: "awaiting-upload",
      externalAi: "allowed",
      aiPolicyVersion: "user-file-2026-09",
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});
export const owned = query({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      s = await ctx.db.get(id);
    if (!s || s.athleteId !== a._id) throw new ConvexError("File unavailable.");
    return s;
  },
});
export const enqueue = mutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      s = await ctx.db.get(id);
    if (!s || s.athleteId !== a._id) throw new ConvexError("File unavailable.");
    await rateLimit(ctx, a._id, "import", 100);
    if (await queueImport(ctx, s))
      await recordProductEvent(ctx, a, "import_started");
  },
});
export async function queueImport(ctx: MutationCtx, source: Doc<"sources">) {
  if (!["awaiting-upload", "failed", "partial"].includes(source.status))
    return false;
  await ctx.db.patch(source._id, {
    status: "queued",
    error: undefined,
    queuedAt: Date.now(),
    archiveScan: undefined,
  });
  // A retry can change a finished archive's aggregate outcome, including a multi-session file inside a ZIP.
  let child = source;
  const visited = new Set<Id<"sources">>([source._id]);
  while (child.parentId) {
    if (visited.has(child.parentId))
      throw new ConvexError("Invalid source hierarchy.");
    visited.add(child.parentId);
    const parent = await ctx.db.get(child.parentId);
    if (
      !parent ||
      parent.athleteId !== source.athleteId ||
      !parent.childIds?.includes(child._id)
    )
      break;
    if (["partial", "complete", "failed"].includes(parent.status)) {
      await ctx.db.patch(parent._id, {
        status: "processing-archive",
        archiveScan: undefined,
        error: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.imports.archiveProgress, {
        id: parent._id,
      });
    } else if (parent.status === "processing-archive" && parent.archiveScan) {
      // A page may already have counted this child as failed. Restart that scan on a retry.
      await ctx.db.patch(parent._id, { archiveScan: undefined });
    }
    child = parent;
  }
  await ctx.scheduler.runAfter(0, internal.processing.process, {
    id: source._id,
  });
  return true;
}
export const get = internalQuery({
  args: { id: v.id("sources") },
  handler: (ctx, { id }) => ctx.db.get(id),
});
export const received = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    key: v.string(),
    expectedKey: v.string(),
    attempt: v.number(),
  },
  handler: async (ctx, { id, hash, key, expectedKey, attempt }) => {
    const s = await ctx.db.get(id);
    const a = s ? await ctx.db.get(s.athleteId) : null;
    if (
      !s ||
      a?.status !== "active" ||
      s.status !== "running" ||
      s.attempts !== attempt ||
      s.key !== expectedKey
    )
      return false;
    if (
      !/^[a-f0-9]{64}$/.test(hash) ||
      key !== `${s.athleteId}/originals/${hash}` ||
      (s.hash && s.hash !== hash)
    )
      throw new ConvexError(
        "The retained original failed its integrity check.",
      );
    const uploadCleanupAt =
      s.uploadKey && s.uploadKey !== key ? Date.now() + 11 * 60000 : undefined;
    await ctx.db.patch(id, {
      hash,
      key,
      uploadCleanupAt,
      receivedAt: s.receivedAt ?? Date.now(),
      format: s.name.split(".").at(-1)?.toLowerCase(),
      mime: /\.zip$/i.test(s.name)
        ? "application/zip"
        : /\.(gpx|tcx)$/i.test(s.name)
          ? "application/xml"
          : "application/octet-stream",
    });
    if (uploadCleanupAt)
      await ctx.scheduler.runAt(
        uploadCleanupAt,
        internal.processing.removeUpload,
        { id },
      );
    return true;
  },
});
export const uploadCleanup = internalQuery({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    return s?.uploadCleanupAt &&
      s.uploadCleanupAt <= Date.now() &&
      s.uploadKey &&
      s.uploadKey.startsWith(`${s.athleteId}/uploads/`) &&
      s.uploadKey !== s.key
      ? s.uploadKey
      : null;
  },
});
export const uploadRemoved = internalMutation({
  args: { id: v.id("sources"), key: v.string() },
  handler: async (ctx, { id, key }) => {
    const s = await ctx.db.get(id);
    if (s?.uploadKey === key && s.key !== key)
      await ctx.db.patch(id, {
        uploadKey: undefined,
        uploadCleanupAt: undefined,
      });
  },
});
export const cleanupUploads = internalMutation({
  args: { cursor: v.optional(v.string()), until: v.optional(v.number()) },
  handler: async (ctx, { cursor, until }) => {
    const cutoff = until ?? Date.now();
    const result = await ctx.db
      .query("sources")
      .withIndex("by_upload_cleanup", (q) =>
        q.gt("uploadCleanupAt", 0).lte("uploadCleanupAt", cutoff),
      )
      .paginate({ cursor: cursor ?? null, numItems: 100 });
    for (const s of result.page)
      await ctx.scheduler.runAfter(0, internal.processing.removeUpload, {
        id: s._id,
      });
    if (!result.isDone)
      await ctx.scheduler.runAfter(1000, internal.imports.cleanupUploads, {
        cursor: result.continueCursor,
        until: cutoff,
      });
  },
});
export const claim = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (!s || !["queued", "retrying"].includes(s.status)) return null;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return null;
    await ctx.db.patch(id, { status: "running", attempts: s.attempts + 1 });
    await ctx.scheduler.runAfter(660000, internal.imports.watchdog, {
      id,
      attempt: s.attempts + 1,
    });
    return { source: s, thresholds: a.thresholds ?? {}, timezone: a.timezone };
  },
});
export const failed = internalMutation({
  args: {
    id: v.id("sources"),
    message: v.string(),
    retryable: v.boolean(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s || s.status !== "running" || !currentAttempt(s, args.attempt))
      return;
    const retry = args.retryable && s.attempts < 4;
    await recordOperation(ctx, {
      kind: "import",
      jobId: s._id,
      athleteId: s.athleteId,
      startedAt: s.receivedAt ?? s.createdAt,
      attempt: s.attempts,
      outcome: retry ? "retrying" : "failed",
      measures: { bytes: s.bytes },
    });
    await ctx.db.patch(s._id, {
      status: retry ? "retrying" : "failed",
      error: args.message,
    });
    if (retry)
      await ctx.scheduler.runAfter(
        Math.min(300000, 2000 * 2 ** s.attempts) +
          Math.floor(Math.random() * 1000),
        internal.processing.process,
        { id: s._id },
      );
  },
});
export const complete = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    summary: v.any(),
    metrics: v.any(),
    route: v.array(v.array(v.number())),
    routeSegments: v.optional(v.array(v.array(v.array(v.number())))),
    streamKey: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.id);
    if (!s || !currentAttempt(s, args.attempt)) return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active")
      throw new ConvexError("Account unavailable.");
    if (s.status === "complete") return;
    const exact = await ctx.db
      .query("sources")
      .withIndex("by_hash", (q) =>
        q.eq("athleteId", s.athleteId).eq("hash", args.hash),
      )
      .filter((q) => q.eq(q.field("status"), "complete"))
      .filter((q) => q.eq(q.field("partIndex"), s.partIndex))
      .first();
    const meta = s.importMetadata as
      import("../packages/core/import").MigrationMetadata | undefined;
    const gearIds: import("./_generated/dataModel").Id<"gear">[] = [];
    if (meta?.gear) {
      const existing = await ctx.db
        .query("gear")
        .withIndex("by_athlete", (q) => q.eq("athleteId", s.athleteId))
        .filter((q) => q.eq(q.field("name"), meta.gear))
        .first();
      gearIds.push(
        existing?._id ??
          (await ctx.db.insert("gear", {
            athleteId: s.athleteId,
            name: meta.gear,
            kind: args.summary.sport === "cycling" ? "bicycle" : "running shoe",
            retired: false,
            servicedAt: 0,
          })),
      );
    }
    if (exact?.activityId) {
      const original = await ctx.db.get(exact.activityId);
      if (original && meta)
        await ctx.db.patch(original._id, {
          title:
            original.title === original.summary.title && meta.title
              ? meta.title
              : original.title,
          notes: original.notes || meta.notes || "",
          tags: original.tags.length
            ? original.tags
            : meta.commute
              ? ["commute"]
              : [],
          gearIds: original.gearIds.length ? original.gearIds : gearIds,
        });
      if (original && meta)
        await publishFacts(ctx, (await ctx.db.get(original._id))!);
      await ctx.db.patch(s._id, {
        status: "duplicate",
        hash: args.hash,
        activityId: exact.activityId,
        parserVersion: VERSION,
      });
      await recordOperation(ctx, {
        kind: "import",
        jobId: s._id,
        athleteId: s.athleteId,
        startedAt: s.receivedAt ?? s.createdAt,
        attempt: s.attempts,
        outcome: "duplicate",
        measures: { bytes: s.bytes },
      });
      return;
    }
    const near = await ctx.db
      .query("activities")
      .withIndex("by_athlete", (q) =>
        q
          .eq("athleteId", s.athleteId)
          .gte("start", args.summary.start - 60000)
          .lte("start", args.summary.start + 60000),
      )
      .collect();
    const duplicate = near.find(
      (n) => duplicateConfidence(n.summary, args.summary) >= 0.7,
    );
    const id = await ctx.db.insert("activities", {
      athleteId: s.athleteId,
      title: meta?.title || args.summary.title,
      sport: args.summary.sport,
      start: args.summary.start,
      duration: args.summary.duration,
      distance: args.summary.distance,
      summary: args.summary,
      metrics: args.metrics,
      route: args.route,
      routeSegments: args.routeSegments,
      streamKey: args.streamKey,
      sourceId: s._id,
      notes: meta?.notes || "",
      tags: meta?.commute ? ["commute"] : [],
      gearIds,
      excludedRecords: false,
      version: VERSION,
      createdAt: Date.now(),
      duplicateOf: duplicate?._id,
    });
    await publishFacts(ctx, (await ctx.db.get(id))!);
    await ctx.db.patch(s._id, {
      status: "complete",
      hash: args.hash,
      activityId: id,
      parserVersion: VERSION,
    });
    await recordOperation(ctx, {
      kind: "import",
      jobId: s._id,
      athleteId: s.athleteId,
      startedAt: s.receivedAt ?? s.createdAt,
      attempt: s.attempts,
      outcome: "complete",
      measures: { bytes: s.bytes },
    });
    if (!s.parentId)
      await ctx.scheduler.runAfter(0, internal.email.enqueue, {
        athleteId: s.athleteId,
        template: "import",
        dedupeKey: `import-${s._id}`,
      });
    if (!s.parentId)
      await ctx.scheduler.runAfter(60000, internal.aiActions.refreshInsight, {
        athleteId: s.athleteId,
      });
  },
});
export const child = internalMutation({
  args: {
    parentId: v.id("sources"),
    name: v.string(),
    key: v.string(),
    bytes: v.number(),
    hash: v.string(),
    importMetadata: v.optional(v.any()),
    partIndex: v.optional(v.number()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const p = await ctx.db.get(args.parentId);
    if (!p || !currentAttempt(p, args.attempt))
      throw new ConvexError("Archive attempt unavailable.");
    if ((await ctx.db.get(p.athleteId))?.status !== "active")
      throw new ConvexError("Account unavailable.");
    const old = await ctx.db
      .query("sources")
      .withIndex("by_parent", (q) =>
        q.eq("parentId", p._id).eq("name", args.name).eq("hash", args.hash),
      )
      .first();
    if (old) {
      if (["failed", "partial"].includes(old.status))
        await queueImport(ctx, old);
      return old._id;
    }
    const { attempt: _attempt, ...child } = args;
    const id = await ctx.db.insert("sources", {
      ...child,
      athleteId: p.athleteId,
      externalAi: p.externalAi ?? "unknown",
      aiPolicyVersion: p.aiPolicyVersion,
      status: "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.processing.process, { id });
    return id;
  },
});
export const archiveComplete = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    childIds: v.array(v.id("sources")),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.id);
    if (
      !source ||
      !currentAttempt(source, args.attempt) ||
      (await ctx.db.get(source.athleteId))?.status !== "active"
    )
      return;
    await ctx.db.patch(args.id, {
      status: "processing-archive",
      hash: args.hash,
      parserVersion: VERSION,
      childIds: [...new Set(args.childIds)],
      archiveScan: undefined,
    });
    await ctx.scheduler.runAfter(1000, internal.imports.archiveProgress, {
      id: args.id,
    });
  },
});
export const watchdog = internalMutation({
  args: { id: v.id("sources"), attempt: v.number() },
  handler: async (ctx, { id, attempt }) => {
    const s = await ctx.db.get(id);
    if (!s || s.status !== "running" || s.attempts !== attempt) return;
    const retry = s.attempts < 4;
    await ctx.db.patch(id, {
      status: retry ? "retrying" : "failed",
      error: retry
        ? "Processing was interrupted. Retrying from the retained original."
        : "Processing was interrupted repeatedly. Your original is retained; retry from import history.",
    });
    if (retry)
      await ctx.scheduler.runAfter(1000, internal.processing.process, { id });
  },
});
export const archiveProgress = internalMutation({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const s = await ctx.db.get(id);
    if (!s || s.status !== "processing-archive") return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return;
    const expected = new Set(s.childIds ?? []);
    const page = await ctx.db
      .query("sources")
      .withIndex("by_parent", (q) => q.eq("parentId", id))
      .paginate({
        cursor: s.archiveScan?.cursor ?? null,
        numItems: 100,
        maximumBytesRead: 2_000_000,
      });
    let completed = s.archiveScan?.completed ?? 0,
      failed = s.archiveScan?.failed ?? 0,
      seen = s.archiveScan?.seen ?? 0;
    for (const child of page.page) {
      if (!expected.has(child._id) || child.athleteId !== s.athleteId) continue;
      seen++;
      if (["complete", "duplicate"].includes(child.status)) completed++;
      else if (["failed", "partial"].includes(child.status)) failed++;
    }
    if (!page.isDone) {
      await ctx.db.patch(id, {
        archiveScan: { cursor: page.continueCursor, completed, failed, seen },
      });
      await ctx.scheduler.runAfter(0, internal.imports.archiveProgress, { id });
      return;
    }
    failed += Math.max(0, expected.size - seen);
    const done = completed + failed === expected.size;
    await ctx.db.patch(id, {
      archiveScan: undefined,
      completedChildren: completed,
      failedChildren: failed,
      status: done ? (failed ? "partial" : "complete") : "processing-archive",
    });
    if (done)
      await recordOperation(ctx, {
        kind: "import",
        jobId: id,
        athleteId: a._id,
        startedAt: s.receivedAt ?? s.createdAt,
        attempt: s.attempts,
        outcome: failed ? "partial" : "complete",
        measures: { bytes: s.bytes },
      });
    if (!done)
      await ctx.scheduler.runAfter(30000, internal.imports.archiveProgress, {
        id,
      });
    else
      await ctx.scheduler.runAfter(0, internal.email.enqueue, {
        athleteId: s.athleteId,
        template: "import",
        dedupeKey: `import-${id}`,
      });
    if (done)
      await ctx.scheduler.runAfter(60000, internal.aiActions.refreshInsight, {
        athleteId: s.athleteId,
      });
  },
});
export const health = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    attempt: v.optional(v.number()),
    samples: v.array(
      v.object({
        at: v.number(),
        kind: v.string(),
        value: v.number(),
        unit: v.string(),
      }),
    ),
  },
  handler: async (ctx, { id, hash, samples, attempt }) => {
    const s = await ctx.db.get(id);
    if (!s || !currentAttempt(s, attempt)) return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return;
    if (a.healthProcessing === false) return;
    const old = await ctx.db
      .query("sources")
      .withIndex("by_hash", (q) => q.eq("athleteId", a._id).eq("hash", hash))
      .filter((q) => q.eq(q.field("status"), "complete"))
      .first();
    if (old) return;
    if (samples.length > 200)
      throw new ConvexError("Use bounded health batches.");
    for (const h of samples) {
      const date = dayKey(h.at, a.timezone),
        existing = await ctx.db
          .query("health")
          .withIndex("by_source", (q) =>
            q.eq("sourceId", id).eq("date", date).eq("kind", h.kind),
          )
          .first();
      const record = {
        ...h,
        date,
        athleteId: a._id,
        source: s.name,
        sourceId: id,
      };
      if (existing) await ctx.db.patch(existing._id, record);
      else await ctx.db.insert("health", record);
    }
  },
});
export const healthComplete = internalMutation({
  args: {
    id: v.id("sources"),
    hash: v.string(),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, { id, hash, attempt }) => {
    const s = await ctx.db.get(id);
    if (!s || !currentAttempt(s, attempt)) return;
    const a = await ctx.db.get(s.athleteId);
    if (!a || a.status !== "active") return;
    await ctx.db.patch(id, {
      status: "complete",
      hash,
      parserVersion: VERSION,
    });
    await recordOperation(ctx, {
      kind: "import",
      jobId: id,
      athleteId: a._id,
      startedAt: s.receivedAt ?? s.createdAt,
      attempt: s.attempts,
      outcome: "complete",
      measures: { bytes: s.bytes },
    });
  },
});
