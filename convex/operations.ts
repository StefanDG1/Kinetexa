import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { queue as queueReprocessing } from "./reprocessing";
import { EXPORT_RETENTION_MS } from "./exportModel";
import type { Doc } from "./_generated/dataModel";
import { queueImport } from "./imports";

const jobKind = v.union(
  v.literal("import"),
  v.literal("reprocess"),
  v.literal("export"),
  v.literal("deletion"),
  v.literal("email"),
);
const states = {
  import: [
    "queued",
    "running",
    "retrying",
    "processing-archive",
    "failed",
    "partial",
  ],
  reprocess: ["queued", "running", "failed"],
  export: ["queued", "running", "retrying", "finalizing", "failed"],
  deletion: ["queued", "running", "retrying", "failed"],
  email: ["queued", "sending", "retrying", "failed", "delivery-unknown"],
};
export const jobs = internalQuery({
  args: {
    kind: jobKind,
    status: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { kind, status, cursor }) => {
    if (!states[kind].includes(status))
      throw new Error("Unsupported job state.");
    const result =
      kind === "reprocess"
        ? await ctx.db
            .query("sources")
            .withIndex("by_reprocess_status", (q) =>
              q.eq("reprocessStatus", status),
            )
            .paginate({ cursor, numItems: 100 })
        : await ctx.db
            .query(
              kind === "import"
                ? "sources"
                : kind === "email"
                  ? "outbox"
                  : "lifecycleJobs",
            )
            .withIndex("by_status", (q) => q.eq("status", status))
            .paginate({ cursor, numItems: 100 });
    return {
      ...result,
      page: result.page
        .filter((r) => !("kind" in r) || r.kind === kind)
        .map((r) => ({
          id: r._id,
          athleteId: r.athleteId,
          status,
          queuedAt:
            kind === "reprocess" && "reprocessQueuedAt" in r
              ? (r.reprocessQueuedAt ?? r.createdAt)
              : "queuedAt" in r
                ? (r.queuedAt ?? r.createdAt)
                : r.createdAt,
          attempts: r.attempts,
          error:
            kind === "reprocess" && "reprocessError" in r
              ? r.reprocessError
              : "error" in r
                ? r.error
                : undefined,
        })),
    };
  },
});
export const events = internalQuery({
  args: {
    since: v.number(),
    until: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: (ctx, { since, until, cursor }) => {
    if (
      !Number.isFinite(since) ||
      !Number.isFinite(until) ||
      since > until ||
      until - since > 31 * 86400000
    )
      throw new Error("Choose an ordered window of at most 31 days.");
    return ctx.db
      .query("operationalEvents")
      .withIndex("by_at", (q) => q.gte("at", since).lte("at", until))
      .paginate({ cursor, numItems: 1000, maximumBytesRead: 4 * 1024 * 1024 });
  },
});
export const retry = internalMutation({
  args: { kind: jobKind, id: v.string() },
  handler: async (ctx, { kind, id }) => {
    if (kind === "email")
      throw new Error(
        "Uncertain email delivery requires review; never bypass provider idempotency expiry.",
      );
    const table =
      kind === "import" || kind === "reprocess" ? "sources" : "lifecycleJobs";
    const normalized = ctx.db.normalizeId(table, id),
      row = normalized ? await ctx.db.get(normalized) : null;
    if (!row) throw new Error("Job unavailable.");
    const athlete = await ctx.db.get(row.athleteId);
    if (
      !athlete ||
      athlete.status !== (kind === "deletion" ? "deleting" : "active")
    )
      throw new Error("Account state does not allow this retry.");
    if (table === "sources" && "name" in row) {
      if (kind === "reprocess") {
        if (
          row.reprocessStatus !== "failed" ||
          !(await queueReprocessing(ctx, row))
        )
          throw new Error("Reprocessing is not awaiting a retry.");
      } else {
        if (
          !["failed", "partial"].includes(row.status) ||
          !(await queueImport(ctx, row))
        )
          throw new Error("Import is not awaiting a retry.");
      }
    } else if ("kind" in row) {
      if (row.kind !== kind || row.status !== "failed")
        throw new Error("Job is not awaiting a retry.");
      if (kind === "deletion")
        await ctx.scheduler.runAfter(0, internal.lifecycle.retryDeletion, {
          id: row._id,
        });
      else {
        if (
          (row.expiresAt ?? row.createdAt + EXPORT_RETENTION_MS) <= Date.now()
        )
          throw new Error(
            "Export expired. The athlete must request a new export.",
          );
        await ctx.db.patch(row._id, {
          status: "retrying",
          attempts: 0,
          error: undefined,
        });
        await ctx.scheduler.runAfter(0, internal.exportActions.run, {
          id: row._id,
        });
      }
    }
    await ctx.db.insert("auditEvents", {
      athleteId: row.athleteId,
      action: `operator_retry_${kind}`,
      at: Date.now(),
    });
  },
});
export const latest = internalQuery({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query("operationalStatus")
      .withIndex("by_key", (q) => q.eq("key", "latest"))
      .unique(),
});
export const publish = internalMutation({
  args: { metrics: v.any(), alerts: v.array(v.string()), at: v.number() },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("operationalStatus")
      .withIndex("by_key", (q) => q.eq("key", "latest"))
      .unique();
    if (old && old.at > args.at) return { newAlerts: [], recovered: [] };
    const newAlerts = args.alerts.filter((id) => !old?.alerts.includes(id)),
      recovered = (old?.alerts ?? []).filter((id) => !args.alerts.includes(id));
    if (old) await ctx.db.replace(old._id, { key: "latest", ...args });
    else await ctx.db.insert("operationalStatus", { key: "latest", ...args });
    return { newAlerts, recovered };
  },
});
type Metrics = {
  events: number;
  failures: number;
  outcomes: Record<string, number>;
  latencyCount: number;
  meanMs: number | null;
  p95Ms: number | null;
  costMicrousd: number;
  bytes: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
};
export const check = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    at: number;
    windowHours: number;
    metrics: Record<string, Metrics>;
    queues: Record<
      string,
      { states: Record<string, number>; oldestPendingMs: number }
    >;
    alerts: string[];
    newAlerts: string[];
    recovered: string[];
  }> => {
    const at = Date.now(),
      metrics: Record<string, Metrics> = {},
      latencies: Record<string, number[]> = {};
    let cursor: string | null = null;
    do {
      const result: {
        page: Doc<"operationalEvents">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.operations.events, {
        since: at - 86400000,
        until: at,
        cursor,
      });
      for (const row of result.page) {
        const metric = (metrics[row.kind] ??= {
          events: 0,
          failures: 0,
          outcomes: {},
          latencyCount: 0,
          meanMs: null,
          p95Ms: null,
          costMicrousd: 0,
          bytes: 0,
          inputTokens: 0,
          outputTokens: 0,
          toolCalls: 0,
        });
        metric.events++;
        metric.outcomes[row.outcome] = (metric.outcomes[row.outcome] ?? 0) + 1;
        if (/failed|timeout|interrupted|partial/.test(row.outcome))
          metric.failures++;
        if (row.startedAt !== undefined)
          (latencies[row.kind] ??= []).push(
            Math.max(0, row.at - row.startedAt),
          );
        for (const key of [
          "costMicrousd",
          "bytes",
          "inputTokens",
          "outputTokens",
          "toolCalls",
        ] as const)
          metric[key] += row.measures?.[key] ?? 0;
      }
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
    for (const [kind, values] of Object.entries(latencies)) {
      values.sort((a, b) => a - b);
      const m = metrics[kind];
      m.latencyCount = values.length;
      m.meanMs = values.reduce((a, b) => a + b, 0) / values.length;
      m.p95Ms = values[Math.ceil(values.length * 0.95) - 1];
    }
    const queues: Record<
        string,
        { states: Record<string, number>; oldestPendingMs: number }
      > = {},
      alerts: string[] = [];
    for (const [kind, statuses] of Object.entries(states)) {
      const q: (typeof queues)[string] = (queues[kind] = {
        states: {},
        oldestPendingMs: 0,
      });
      for (const status of statuses) {
        cursor = null;
        let count = 0;
        do {
          const result: {
            page: { queuedAt: number }[];
            isDone: boolean;
            continueCursor: string;
          } = await ctx.runQuery(internal.operations.jobs, {
            kind: kind as keyof typeof states,
            status,
            cursor,
          });
          count += result.page.length;
          if (!["failed", "partial", "delivery-unknown"].includes(status))
            for (const row of result.page)
              q.oldestPendingMs = Math.max(
                q.oldestPendingMs,
                at - row.queuedAt,
              );
          cursor = result.isDone ? null : result.continueCursor;
        } while (cursor);
        q.states[status] = count;
      }
      const threshold =
        kind === "email"
          ? 26 * 3600000
          : kind === "deletion"
            ? 3600000
            : 1800000;
      if (q.oldestPendingMs > threshold) alerts.push(`${kind}-backlog`);
      if ((kind === "export" || kind === "deletion") && q.states.failed)
        alerts.push(`${kind}-failed`);
      if (kind === "email" && (q.states.failed || q.states["delivery-unknown"]))
        alerts.push("email-delivery-review");
    }
    for (const [kind, m] of Object.entries(metrics))
      if (m.failures >= 5 && m.failures / m.events >= 0.2)
        alerts.push(`${kind}-failure-rate`);
    if ((metrics.ai?.costMicrousd ?? 0) > 2_000_000)
      alerts.push("ai-daily-cost");
    const changes = await ctx.runMutation(internal.operations.publish, {
      at,
      metrics: { events: metrics, queues, windowHours: 24 },
      alerts,
    });
    return { at, windowHours: 24, metrics, queues, alerts, ...changes };
  },
});
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("operationalEvents")
      .withIndex("by_at", (q) => q.lt("at", Date.now() - 30 * 86400000))
      .take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 500)
      await ctx.scheduler.runAfter(0, internal.operations.prune, {});
  },
});
