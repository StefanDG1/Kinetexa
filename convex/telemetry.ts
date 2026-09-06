import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import {
  productEvent,
  recordProductEvent,
  telemetryConfigured,
} from "./telemetryModel";
import { paginationOptsValidator } from "convex/server";
const clientEvents = new Set([
  "dashboard_viewed",
  "activity_viewed",
  "map_viewed",
  "date_range_changed",
  "metric_explanation_opened",
  "map_filter_applied",
  "ai_insight_opened",
]);
export const track = mutation({
  args: { event: productEvent },
  handler: async (ctx, { event }) => {
    const a = await requireAthlete(ctx);
    if (!a.analyticsConsent) return { recorded: false };
    if (!clientEvents.has(event))
      throw new ConvexError("This event is recorded by the server.");
    await rateLimit(ctx, a._id, "product-events", 120, 60000);
    await recordProductEvent(ctx, a, event);
    return { recorded: true };
  },
});
export const queryCompleted = internalMutation({
  args: { athleteId: v.id("athletes"), consentRevision: v.number() },
  handler: async (ctx, { athleteId, consentRevision }) => {
    const athlete = await ctx.db.get(athleteId);
    if (athlete && (athlete.analyticsConsentRevision ?? 0) === consentRevision)
      await recordProductEvent(ctx, athlete, "analysis_query_run");
  },
});
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    const result = await ctx.db
      .query("productEvents")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: 100 });
    return {
      ...result,
      page: result.page.map(({ event, at, status }) => ({ event, at, status })),
    };
  },
});
export const claim = internalMutation({
  args: { id: v.id("productEvents") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id),
      a = row ? await ctx.db.get(row.athleteId) : null;
    if (!row || !["queued", "retrying"].includes(row.status)) return null;
    if (
      !a ||
      a.status !== "active" ||
      !a.analyticsConsent ||
      (a.analyticsConsentRevision ?? 0) !== row.consentRevision
    ) {
      await ctx.db.patch(id, { status: "dropped" });
      return null;
    }
    if (!telemetryConfigured()) {
      await ctx.db.patch(id, { status: "local-only" });
      return null;
    }
    const attempt = row.attempts + 1;
    await ctx.db.patch(id, { status: "sending", attempts: attempt });
    // Record possible transmission before the request so uncertain network outcomes still require erasure.
    const distinctId =
      a.telemetryDistinctId ??
      `kinetexa:${process.env.KINETEXA_ENVIRONMENT}:${a._id}`;
    await ctx.db.patch(a._id, {
      telemetryTransmitted: true,
      telemetryDistinctId: distinctId,
    });
    await ctx.scheduler.runAfter(60000, internal.telemetry.result, {
      id,
      attempt,
      failed: true,
    });
    return { ...row, attempt, distinctId };
  },
});
export const permitted = internalQuery({
  args: { id: v.id("productEvents"), attempt: v.number() },
  handler: async (ctx, { id, attempt }) => {
    const row = await ctx.db.get(id),
      a = row ? await ctx.db.get(row.athleteId) : null;
    return Boolean(
      telemetryConfigured() &&
      row?.status === "sending" &&
      row.attempts === attempt &&
      a?.status === "active" &&
      a.analyticsConsent &&
      (a.analyticsConsentRevision ?? 0) === row.consentRevision,
    );
  },
});
export const result = internalMutation({
  args: {
    id: v.id("productEvents"),
    attempt: v.number(),
    failed: v.boolean(),
    dropped: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, attempt, failed, dropped }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "sending" || row.attempts !== attempt) return;
    const retry = failed && attempt < 4 && !dropped;
    await ctx.db.patch(id, {
      status: dropped
        ? "dropped"
        : retry
          ? "retrying"
          : failed
            ? "failed"
            : "sent",
    });
    if (retry)
      await ctx.scheduler.runAfter(
        30000 * 2 ** attempt,
        internal.telemetryActions.send,
        { id },
      );
  },
});
export const deletionContext = internalQuery({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }) => {
    const a = await ctx.db.get(athleteId);
    if (a?.status !== "deleting")
      throw new Error("Account is not awaiting deletion.");
    return {
      transmitted: a.telemetryTransmitted ?? false,
      requested: a.telemetryDeletionRequested ?? false,
      distinctId: a.telemetryDistinctId,
    };
  },
});
export const deletionRequested = internalMutation({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }) => {
    const a = await ctx.db.get(athleteId);
    if (a?.status !== "deleting")
      throw new Error("Account is not awaiting deletion.");
    await ctx.db.patch(athleteId, { telemetryDeletionRequested: true });
  },
});
export const deletionVerified = internalMutation({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }) => {
    const a = await ctx.db.get(athleteId);
    if (a?.status !== "deleting" || !a.telemetryDeletionRequested)
      throw new Error("Analytics deletion was not requested.");
    await ctx.db.patch(athleteId, { telemetryDeletionVerified: true });
  },
});
export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("productEvents")
      .withIndex("by_at", (q) => q.lt("at", Date.now() - 90 * 86400000))
      .take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 500)
      await ctx.scheduler.runAfter(0, internal.telemetry.prune, {});
  },
});
