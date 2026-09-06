import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { recordOperation } from "./operationModel";
import { paginationOptsValidator } from "convex/server";
const severity: Record<string, number> = {
  delivered: 1,
  failed: 2,
  bounced: 3,
  complained: 4,
};
function newerDelivery(
  old: { status: string; occurredAt: number },
  next: { status: string; occurredAt: number },
) {
  if ((severity[old.status] ?? 0) >= 3)
    return severity[next.status] > severity[old.status];
  return (
    next.occurredAt > old.occurredAt ||
    (next.occurredAt === old.occurredAt &&
      (severity[next.status] ?? 0) > (severity[old.status] ?? 0))
  );
}
const payload = v.object({
  from: v.string(),
  to: v.string(),
  subject: v.string(),
  text: v.string(),
});

export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    const result = await ctx.db
      .query("outbox")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: 50 });
    return {
      ...result,
      page: result.page.map(
        ({ payload: _payload, dedupeKey: _dedupeKey, ...row }) => row,
      ),
    };
  },
});
export const enqueue = internalMutation({
  args: {
    athleteId: v.id("athletes"),
    template: v.string(),
    dedupeKey: v.string(),
  },
  handler: async (ctx, args) => {
    const athlete = await ctx.db.get(args.athleteId);
    if (!athlete || athlete.status !== "active") return;
    if (
      await ctx.db
        .query("outbox")
        .withIndex("by_key", (q) => q.eq("dedupeKey", args.dedupeKey))
        .unique()
    )
      return;
    const id = await ctx.db.insert("outbox", {
      ...args,
      status: athlete.emailSuppressed ? "suppressed" : "queued",
      attempts: 0,
      createdAt: Date.now(),
    });
    if (!athlete.emailSuppressed)
      await ctx.scheduler.runAfter(0, internal.emailActions.send, { id });
    return id;
  },
});
export const claim = internalMutation({
  args: { id: v.id("outbox") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row || !["queued", "retrying"].includes(row.status)) return null;
    const a = await ctx.db.get(row.athleteId);
    const deletion = row.template === "deletion";
    if (deletion && Date.now() - row.createdAt >= 86400000) {
      await ctx.db.delete(id);
      return null;
    }
    if (deletion ? Boolean(a) || !row.payload : !a || a.status !== "active")
      return null;
    if (a?.emailSuppressed) {
      await ctx.db.patch(id, { status: "suppressed", payload: undefined });
      return null;
    }
    // Resend forgets an idempotency key after 24 hours; an uncertain old attempt must not be resent automatically.
    if (
      row.firstAttemptAt !== undefined &&
      Date.now() - row.firstAttemptAt >= 23 * 3600000
    ) {
      await ctx.db.patch(id, {
        status: "delivery-unknown",
        payload: undefined,
      });
      return null;
    }
    const now = new Date(),
      key = "resend-" + now.toISOString().slice(0, 10);
    const counter = await ctx.db
      .query("systemCounters")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if ((counter?.count ?? 0) >= 90) {
      await ctx.db.patch(id, { status: "retrying" });
      await ctx.scheduler.runAt(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
          0,
          1,
        ),
        internal.emailActions.send,
        { id },
      );
      return null;
    }
    if (counter) await ctx.db.patch(counter._id, { count: counter.count + 1 });
    else await ctx.db.insert("systemCounters", { key, count: 1 });
    const attempt = row.attempts + 1;
    await ctx.db.patch(id, {
      status: "sending",
      attempts: attempt,
      firstAttemptAt: row.firstAttemptAt ?? Date.now(),
    });
    await ctx.scheduler.runAfter(60000, internal.email.watchdog, {
      id,
      attempt,
    });
    return { row, userId: a?.workosUserId ?? "", attempt };
  },
});
export const rememberPayload = internalMutation({
  args: { id: v.id("outbox"), attempt: v.number(), payload },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.status !== "sending" || row.attempts !== args.attempt)
      throw new Error("Email attempt expired.");
    const a = await ctx.db.get(row.athleteId);
    if (
      row.template === "deletion"
        ? Boolean(a) || !row.payload
        : !a || a.status !== "active" || a.emailSuppressed
    )
      throw new Error("Recipient unavailable.");
    if (!row.payload) await ctx.db.patch(row._id, { payload: args.payload });
    return row.payload ?? args.payload;
  },
});
async function applyDelivery(
  ctx: MutationCtx,
  row: Doc<"outbox">,
  event: Doc<"emailEvents">,
) {
  if (
    newerDelivery(
      { status: row.status, occurredAt: row.deliveryAt ?? 0 },
      event,
    )
  ) {
    await ctx.db.patch(row._id, {
      status: event.status,
      deliveryAt: event.occurredAt,
      payload: undefined,
    });
    if (
      ["bounced", "complained"].includes(event.status) &&
      (await ctx.db.get(row.athleteId))
    )
      await ctx.db.patch(row.athleteId, { emailSuppressed: event.status });
  }
  await ctx.db.patch(event._id, { athleteId: row.athleteId });
}
export const result = internalMutation({
  args: {
    id: v.id("outbox"),
    attempt: v.number(),
    providerId: v.optional(v.string()),
    failed: v.boolean(),
    retryable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.attempts !== args.attempt || row.status !== "sending")
      return;
    const retry = args.failed && args.retryable !== false && row.attempts < 4;
    await recordOperation(ctx, {
      kind: "email",
      jobId: row._id,
      ...(row.template === "deletion" ? {} : { athleteId: row.athleteId }),
      startedAt: row.firstAttemptAt ?? row.createdAt,
      attempt: row.attempts,
      outcome: retry ? "retrying" : args.failed ? "failed" : "sent",
    });
    await ctx.db.patch(row._id, {
      status: retry ? "retrying" : args.failed ? "failed" : "sent",
      providerId: args.providerId,
      ...(retry ? {} : { payload: undefined }),
    });
    if (args.providerId) {
      const event = await ctx.db
        .query("emailEvents")
        .withIndex("by_provider", (q) => q.eq("providerId", args.providerId!))
        .unique();
      if (event) await applyDelivery(ctx, row, event);
      if (row.template === "deletion") {
        if (event)
          await ctx.db.patch(event._id, {
            athleteId: undefined,
            template: "deletion",
          });
        else
          await ctx.db.insert("emailEvents", {
            providerId: args.providerId,
            eventId: `accepted-${args.providerId}`,
            template: "deletion",
            status: "sent",
            occurredAt: 0,
            createdAt: Date.now(),
          });
      }
    }
    if (!retry && row.template === "deletion") await ctx.db.delete(row._id);
    if (retry)
      await ctx.scheduler.runAfter(
        30000 * 2 ** row.attempts,
        internal.emailActions.send,
        { id: row._id },
      );
  },
});
export const watchdog = internalMutation({
  args: { id: v.id("outbox"), attempt: v.number() },
  handler: async (ctx, { id, attempt }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "sending" || row.attempts !== attempt) return;
    const retry = attempt < 4;
    await ctx.db.patch(id, {
      status: retry ? "retrying" : "delivery-unknown",
      ...(retry ? {} : { payload: undefined }),
    });
    if (retry)
      await ctx.scheduler.runAfter(1000, internal.emailActions.send, { id });
  },
});
export const delivery = internalMutation({
  args: {
    providerId: v.string(),
    status: v.union(
      v.literal("delivered"),
      v.literal("bounced"),
      v.literal("complained"),
      v.literal("failed"),
    ),
    occurredAt: v.number(),
    eventId: v.string(),
  },
  handler: async (ctx, args) => {
    let event = await ctx.db
      .query("emailEvents")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .unique();
    if (!event)
      event = (await ctx.db.get(
        await ctx.db.insert("emailEvents", { ...args, createdAt: Date.now() }),
      ))!;
    else if (newerDelivery(event, args)) {
      await ctx.db.patch(event._id, args);
      event = { ...event, ...args };
    }
    const row = await ctx.db
      .query("outbox")
      .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
      .unique();
    if (row) await applyDelivery(ctx, row, event);
  },
});
export const pruneEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("emailEvents")
      .withIndex("by_created", (q) =>
        q.lt("createdAt", Date.now() - 30 * 86400000),
      )
      .take(200);
    for (const event of expired) await ctx.db.delete(event._id);
    if (expired.length === 200)
      await ctx.scheduler.runAfter(1000, internal.email.pruneEvents, {});
  },
});
export const pruneDeletionNotices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("outbox")
      .withIndex("by_template_created", (q) =>
        q.eq("template", "deletion").lt("createdAt", Date.now() - 86400000),
      )
      .take(200);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 200)
      await ctx.scheduler.runAfter(0, internal.email.pruneDeletionNotices, {});
  },
});
export const deliveryEvents = internalQuery({
  args: { after: v.number() },
  handler: (ctx, { after }) =>
    ctx.db
      .query("emailEvents")
      .withIndex("by_created", (q) => q.gte("createdAt", after))
      .order("desc")
      .take(100),
});

// One-time upgrade for sends created before attempt leases existed. Never risk resending an accepted legacy message.
export const repairLegacy = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("outbox")
      .paginate({ cursor: cursor ?? null, numItems: 100 });
    let repaired = 0;
    for (const row of page.page) {
      if (
        ["sending", "retrying"].includes(row.status) &&
        row.attempts > 0 &&
        row.firstAttemptAt === undefined
      ) {
        await ctx.db.patch(row._id, {
          status: "delivery-unknown",
          payload: undefined,
        });
        repaired++;
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.email.repairLegacy, {
        cursor: page.continueCursor,
      });
    return { repaired, complete: page.isDone };
  },
});
