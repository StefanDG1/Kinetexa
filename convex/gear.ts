import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
import type { Doc } from "./_generated/dataModel";

export const reminders = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("gearReminders")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .collect();
  },
});
export const list = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("gear")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .collect();
  },
});
export const saveReminder = mutation({
  args: {
    id: v.optional(v.id("gearReminders")),
    gearId: v.id("gear"),
    title: v.string(),
    distanceKm: v.optional(v.number()),
    durationHours: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    disabled: v.boolean(),
  },
  handler: async (ctx, { id, ...args }) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "edit", 500);
    const gear = await ctx.db.get(args.gearId);
    if (gear?.athleteId !== a._id) throw new ConvexError("Gear unavailable.");
    if (
      !args.title.trim() ||
      args.title.length > 120 ||
      [args.distanceKm, args.durationHours].some(
        (n) => n !== undefined && (!Number.isFinite(n) || n <= 0),
      ) ||
      (args.dueAt !== undefined &&
        (!Number.isFinite(args.dueAt) ||
          args.dueAt < 0 ||
          args.dueAt > 8640000000000000)) ||
      (!args.disabled &&
        args.distanceKm === undefined &&
        args.durationHours === undefined &&
        args.dueAt === undefined)
    )
      throw new ConvexError(
        "Choose a reminder title and a positive service interval or due date.",
      );
    if (id) {
      const old = await ctx.db.get(id);
      if (old?.athleteId !== a._id || old.gearId !== args.gearId)
        throw new ConvexError("Reminder unavailable.");
      // Omitted optional fields deliberately clear previous thresholds.
      await ctx.db.patch(id, {
        ...args,
        title: args.title.trim(),
        distanceKm: args.distanceKm,
        durationHours: args.durationHours,
        dueAt: args.dueAt,
      });
      return id;
    }
    if (
      (
        await ctx.db
          .query("gearReminders")
          .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
          .take(500)
      ).length >= 500
    )
      throw new ConvexError("The account limit is 500 maintenance reminders.");
    return ctx.db.insert("gearReminders", {
      ...args,
      title: args.title.trim(),
      athleteId: a._id,
      servicedAt: gear.servicedAt,
      createdAt: Date.now(),
    });
  },
});
export const completeService = mutation({
  args: { id: v.id("gearReminders"), at: v.number(), note: v.string() },
  handler: async (ctx, { id, at, note }) => {
    const a = await requireAthlete(ctx),
      reminder = await ctx.db.get(id);
    if (reminder?.athleteId !== a._id)
      throw new ConvexError("Reminder unavailable.");
    if (!Number.isFinite(at) || at < 0 || at > Date.now() || note.length > 2000)
      throw new ConvexError(
        "Choose a completed service date and a note under 2,000 characters.",
      );
    const previous = await ctx.db
      .query("gearServices")
      .withIndex("by_reminder_at", (q) => q.eq("reminderId", id).eq("at", at))
      .unique();
    if (previous) return previous._id;
    if (at < reminder.servicedAt)
      throw new ConvexError(
        "Service cannot precede the current service baseline.",
      );
    await rateLimit(ctx, a._id, "edit", 500);
    const event = await ctx.db.insert("gearServices", {
      athleteId: a._id,
      gearId: reminder.gearId,
      reminderId: id,
      at,
      note,
    });
    await ctx.db.patch(id, {
      servicedAt: at,
      dueAt: undefined,
      disabled:
        reminder.distanceKm === undefined &&
        reminder.durationHours === undefined,
    });
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "gear_serviced",
      at: Date.now(),
    });
    return event;
  },
});
export const history = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const a = await requireAthlete(ctx);
    return ctx.db
      .query("gearServices")
      .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(100, Math.max(1, paginationOpts.numItems)),
      });
  },
});
export const usagePage = query({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const a = await requireAthlete(ctx),
      result = await ctx.db
        .query("activities")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .paginate({ cursor, numItems: 100 });
    return {
      ...result,
      page: result.page
        .filter((r) => !r.mergedInto)
        .map((r) => ({
          start: r.start,
          gearIds: r.gearIds,
          distance: r.distance,
          duration: r.duration,
        })),
    };
  },
});
type Usage = {
  distanceKm: number;
  durationHours: number;
  activityCount: number;
  distanceMeasuredCount: number;
};
const empty = (): Usage => ({
  distanceKm: 0,
  durationHours: 0,
  activityCount: 0,
  distanceMeasuredCount: 0,
});
export const status = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    gear: (Doc<"gear"> & { usage: Usage })[];
    reminders: (Doc<"gearReminders"> & {
      usage: Usage;
      due: boolean;
      retired: boolean;
    })[];
    readAt: number;
  }> => {
    await ctx.runMutation(api.workspace.authorizeQuery, {});
    const [gear, reminders] = await Promise.all([
      ctx.runQuery(api.gear.list, {}),
      ctx.runQuery(api.gear.reminders, {}),
    ]);
    const totals = new Map(gear.map((g) => [g._id, empty()])),
      since = new Map(reminders.map((r) => [r._id, empty()]));
    const add = (
      usage: Usage,
      row: { distance?: number; duration: number },
    ) => {
      usage.activityCount++;
      usage.durationHours += row.duration / 3600;
      if (row.distance !== undefined) {
        usage.distanceMeasuredCount++;
        usage.distanceKm += row.distance / 1000;
      }
    };
    let cursor: string | null = null;
    do {
      const result: {
        page: {
          start: number;
          gearIds: Doc<"gear">["_id"][];
          distance?: number;
          duration: number;
        }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(api.gear.usagePage, { cursor });
      for (const row of result.page) {
        for (const id of new Set(row.gearIds)) {
          const total = totals.get(id);
          if (total) add(total, row);
        }
        for (const reminder of reminders)
          if (
            row.start > reminder.servicedAt &&
            row.gearIds.includes(reminder.gearId)
          )
            add(since.get(reminder._id)!, row);
      }
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
    const now = Date.now();
    return {
      gear: gear.map((g) => ({ ...g, usage: totals.get(g._id)! })),
      reminders: reminders.map((r) => {
        const usage = since.get(r._id)!,
          retired = gear.find((g) => g._id === r.gearId)?.retired ?? true;
        return {
          ...r,
          usage,
          retired,
          due:
            !r.disabled &&
            !retired &&
            ((r.distanceKm !== undefined && usage.distanceKm >= r.distanceKm) ||
              (r.durationHours !== undefined &&
                usage.durationHours >= r.durationHours) ||
              (r.dueAt !== undefined && r.dueAt <= now)),
        };
      }),
      readAt: now,
    };
  },
});
