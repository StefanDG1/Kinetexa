import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  mutation,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import { evidenceSchema } from "../packages/core/ai";
import { dayKey } from "../packages/core/dashboard";
import { hasPremium } from "../packages/core/entitlements";
import { recordOperation, operationPhases } from "./operationModel";
import { recordProductEvent } from "./telemetryModel";

export async function requireRun(ctx: QueryCtx, id: Id<"aiRuns">) {
  const run = await ctx.db.get(id),
    a = run ? await ctx.db.get(run.athleteId) : null;
  const identity = await ctx.auth.getUserIdentity();
  if (
    !run ||
    !a ||
    a.status !== "active" ||
    (identity && identity.subject !== a.workosUserId)
  )
    throw new ConvexError("AI request unavailable.");
  if (
    !a.aiConsent ||
    (a.aiConsentRevision ?? 0) !== run.revision ||
    (run.purpose === "insight" && !a.insightConsent)
  )
    throw new ConvexError(
      "AI consent changed. Start a new request if you enable it again.",
    );
  if (run.status !== "pending" || Date.now() - run.startedAt > 30000)
    throw new ConvexError("AI request expired.");
  return { run, athlete: a };
}
export const begin = internalMutation({
  args: {
    question: v.string(),
    athleteId: v.optional(v.id("athletes")),
    fingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const a = args.athleteId
      ? await ctx.db.get(args.athleteId)
      : await requireAthlete(ctx);
    const purpose = args.athleteId ? "insight" : "ask";
    if (
      !a ||
      a.status !== "active" ||
      !a.aiConsent ||
      (purpose === "insight" && !a.insightConsent)
    )
      throw new ConvexError("AI is off. Review optional consent in Settings.");
    if (!args.question.trim() || args.question.length > 1500)
      throw new ConvexError("Use a question up to 1,500 characters.");
    await rateLimit(ctx, a._id, "ai-minute", 3, 60000);
    if (purpose === "insight") {
      await rateLimit(ctx, a._id, "ai-insight-day", 1, 86400000);
      if (
        await ctx.db
          .query("insights")
          .withIndex("by_fingerprint", (q) =>
            q.eq("athleteId", a._id).eq("fingerprint", args.fingerprint!),
          )
          .first()
      )
        throw new ConvexError("This insight already exists or was dismissed.");
    }
    const b = await ctx.db
      .query("billing")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .unique();
    const limit = hasPremium(b) ? 200 : 10,
      window = new Date().toISOString().slice(0, 7);
    const u = await ctx.db
      .query("usage")
      .withIndex("by_athlete", (q) =>
        q.eq("athleteId", a._id).eq("kind", "ai-month").eq("window", window),
      )
      .unique();
    if ((u?.count ?? 0) >= limit)
      throw new ConvexError(
        "Your monthly AI allowance is used. Core analytics remain available.",
      );
    if (u) await ctx.db.patch(u._id, { count: u.count + 1 });
    else
      await ctx.db.insert("usage", {
        athleteId: a._id,
        kind: "ai-month",
        window,
        count: 1,
      });
    const runId = await ctx.db.insert("aiRuns", {
      athleteId: a._id,
      revision: a.aiConsentRevision ?? 0,
      purpose,
      status: "pending",
      startedAt: Date.now(),
      contextBytes: 0,
      toolCalls: 0,
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      fingerprint: args.fingerprint,
    });
    if (purpose === "ask")
      await ctx.db.insert("messages", {
        athleteId: a._id,
        role: "user",
        content: args.question,
        at: Date.now(),
        runId,
      });
    await ctx.scheduler.runAfter(35000, internal.ai.expire, { runId });
    if (purpose === "ask")
      await recordProductEvent(ctx, a, "ai_question_asked");
    return { runId, timezone: a.timezone, athleteId: a._id };
  },
});
export const consent = internalQuery({
  args: { runId: v.id("aiRuns") },
  handler: (ctx, { runId }) => requireRun(ctx, runId),
});
export const history = internalQuery({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const { athlete } = await requireRun(ctx, runId);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_athlete", (q) => q.eq("athleteId", athlete._id))
      .order("desc")
      .take(8);
    // Questions provide conversational intent; old evidence is recalculated under current consent and source policies.
    return rows
      .filter((m) => m.role === "user" && m.runId !== runId)
      .slice(0, 3)
      .reverse()
      .map((m) => m.content.slice(0, 750));
  },
});
const telemetry = {
  contextBytes: v.number(),
  toolCalls: v.number(),
  tools: v.optional(v.array(v.string())),
  modelCalls: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  costMicrousd: v.optional(v.number()),
  model: v.optional(v.string()),
  costSource: v.optional(v.string()),
};
export const finish = internalMutation({
  args: {
    phases: v.optional(operationPhases),
    runId: v.id("aiRuns"),
    status: v.string(),
    content: v.string(),
    evidence: v.array(v.any()),
    ...telemetry,
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "pending") return;
    const a = await ctx.db.get(run.athleteId);
    if (!a || a.status !== "active") return;
    const { runId, status, content, evidence, phases, ...stats } = args;
    const valid =
      a.aiConsent &&
      (a.aiConsentRevision ?? 0) === run.revision &&
      (run.purpose !== "insight" || a.insightConsent);
    const finalStatus = valid ? status : "consent-revoked";
    const parsed = evidence.map((e) => evidenceSchema.parse(e));
    await ctx.db.patch(runId, {
      ...stats,
      status: finalStatus,
      finishedAt: Date.now(),
    });
    await recordOperation(ctx, {
      kind: "ai",
      jobId: runId,
      athleteId: run.athleteId,
      startedAt: run.startedAt,
      outcome: finalStatus,
      measures: {
        phases,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        toolCalls: stats.toolCalls,
        costMicrousd: stats.costMicrousd,
      },
    });
    if (stats.modelCalls === 0) {
      const window = new Date(run.startedAt).toISOString().slice(0, 7);
      const u = await ctx.db
        .query("usage")
        .withIndex("by_athlete", (q) =>
          q.eq("athleteId", a._id).eq("kind", "ai-month").eq("window", window),
        )
        .unique();
      if (u) await ctx.db.patch(u._id, { count: Math.max(0, u.count - 1) });
    }
    if (run.purpose === "ask")
      await ctx.db.insert("messages", {
        athleteId: a._id,
        role: "assistant",
        content: valid
          ? content
          : "AI consent changed before the answer was saved. No answer was retained.",
        evidence: valid ? parsed : [],
        at: Date.now(),
        runId,
      });
    else if (valid && status === "completed" && run.fingerprint)
      await ctx.db.insert("insights", {
        athleteId: a._id,
        fingerprint: run.fingerprint,
        content,
        evidence: parsed,
        dismissed: false,
        at: Date.now(),
      });
  },
});
export const expire = internalMutation({
  args: { runId: v.id("aiRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "pending") return;
    await ctx.db.patch(runId, {
      status: "interrupted",
      finishedAt: Date.now(),
    });
    const a = await ctx.db.get(run.athleteId);
    if (a?.status === "active" && run.purpose === "ask")
      await ctx.db.insert("messages", {
        athleteId: a._id,
        role: "assistant",
        content:
          "This request was interrupted. You can try it again; no answer was produced.",
        at: Date.now(),
        runId,
      });
  },
});
export const messages = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("messages")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 50),
      });
  },
});
export const runStatus = query({
  args: { id: v.id("aiRuns") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      r = await ctx.db.get(id);
    if (!r || r.athleteId !== a._id)
      throw new ConvexError("AI request unavailable.");
    const {
      athleteId: _athlete,
      revision: _revision,
      fingerprint: _fingerprint,
      ...status
    } = r;
    return status;
  },
});
export const feedback = mutation({
  args: {
    messageId: v.id("messages"),
    helpful: v.union(v.boolean(), v.null()),
  },
  handler: async (ctx, { messageId, helpful }) => {
    const a = await requireAthlete(ctx),
      message = await ctx.db.get(messageId);
    if (!message || message.athleteId !== a._id || message.role !== "assistant")
      throw new ConvexError("Answer unavailable.");
    await rateLimit(ctx, a._id, "ai-feedback", 30, 60000);
    if (helpful === null) {
      await ctx.db.patch(messageId, { feedback: undefined });
      return;
    }
    const run = message.runId ? await ctx.db.get(message.runId) : null;
    if (
      !run ||
      run.athleteId !== a._id ||
      !["completed", "evidence-only"].includes(run.status) ||
      !Array.isArray(message.evidence) ||
      !message.evidence.length ||
      !message.evidence.every((e) => evidenceSchema.safeParse(e).success)
    )
      throw new ConvexError(
        "Only completed answers with evidence can be rated.",
      );
    if (message.feedback?.helpful !== helpful)
      await ctx.db.patch(messageId, { feedback: { helpful, at: Date.now() } });
  },
});
export const usage = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx),
      b = await ctx.db
        .query("billing")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .unique();
    const window = new Date().toISOString().slice(0, 7),
      u = await ctx.db
        .query("usage")
        .withIndex("by_athlete", (q) =>
          q.eq("athleteId", a._id).eq("kind", "ai-month").eq("window", window),
        )
        .unique();
    return {
      used: u?.count ?? 0,
      limit: hasPremium(b) ? 200 : 10,
      window,
    };
  },
});
export const insights = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    if (!a.aiConsent || !a.insightConsent) return [];
    return ctx.db
      .query("insights")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .filter((q) => q.eq(q.field("dismissed"), false))
      .order("desc")
      .take(5);
  },
});
export const dismiss = mutation({
  args: { id: v.id("insights") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      i = await ctx.db.get(id);
    if (!i || i.athleteId !== a._id)
      throw new ConvexError("Insight unavailable.");
    await ctx.db.patch(id, { dismissed: true });
  },
});
export const insightEligibility = internalQuery({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }) => {
    const a = await ctx.db.get(athleteId);
    if (!a || a.status !== "active" || !a.aiConsent || !a.insightConsent)
      return null;
    const today = dayKey(Date.now(), a.timezone),
      fingerprint = `load-week-${today}`;
    if (
      await ctx.db
        .query("insights")
        .withIndex("by_fingerprint", (q) =>
          q.eq("athleteId", a._id).eq("fingerprint", fingerprint),
        )
        .first()
    )
      return null;
    return { today };
  },
});
