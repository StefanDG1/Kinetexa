import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireAthlete } from "./athletes";
import { recordProductEvent } from "./telemetryModel";
import { ownedActivity } from "./activities";
import { maskedRoute, type Point } from "../packages/core/geo";
import { dayKey } from "../packages/core/dashboard";
import { rateLimit } from "./limits";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
const allowed = [
  "title",
  "sport",
  "date",
  "distance",
  "duration",
  "elevation",
  "route",
];
type Selection = {
  activityIds: Id<"activities">[];
  fields: string[];
  kind: string;
};
function validSelection(selection: Selection) {
  return (
    ["activity", "dashboard", "statistics", "map"].includes(selection.kind) &&
    selection.activityIds.length > 0 &&
    selection.activityIds.length <= 100 &&
    new Set(selection.activityIds).size === selection.activityIds.length &&
    selection.fields.length > 0 &&
    selection.fields.length <= allowed.length &&
    new Set(selection.fields).size === selection.fields.length &&
    selection.fields.every((field) => allowed.includes(field))
  );
}
export const create = mutation({
  args: {
    token: v.string(),
    kind: v.string(),
    activityIds: v.array(v.id("activities")),
    fields: v.array(v.string()),
    expires: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    await rateLimit(ctx, a._id, "share", 30);
    if (
      !/^[a-f0-9]{64}$/.test(args.token) ||
      !validSelection(args) ||
      (args.expires !== undefined &&
        (!Number.isFinite(args.expires) ||
          args.expires > 8640000000000000 ||
          args.expires <= Date.now()))
    )
      throw new ConvexError("Check the shared fields and expiry.");
    if (
      await ctx.db
        .query("shares")
        .withIndex("by_token", (q) => q.eq("token", args.token))
        .first()
    )
      throw new ConvexError(
        "This share token is already in use. Create a new link.",
      );
    for (const id of args.activityIds) await ownedActivity(ctx, id);
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "share_created",
      at: Date.now(),
    });
    const id = await ctx.db.insert("shares", {
      ...args,
      athleteId: a._id,
      revoked: false,
      createdAt: Date.now(),
    });
    await recordProductEvent(ctx, a, "share_created");
    if (args.expires !== undefined)
      await ctx.scheduler.runAt(args.expires, internal.sharing.expire, { id });
    return id;
  },
});
export const expire = internalMutation({
  args: { id: v.id("shares") },
  handler: async (ctx, { id }) => {
    const share = await ctx.db.get(id);
    if (share && share.expires !== undefined && share.expires <= Date.now())
      await ctx.db.patch(id, { revoked: true });
  },
});
export const revoke = mutation({
  args: { id: v.id("shares") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      s = await ctx.db.get(id);
    if (s?.athleteId !== a._id) throw new ConvexError("Share unavailable.");
    if (!s.revoked) await recordProductEvent(ctx, a, "share_revoked");
    await ctx.db.patch(id, { revoked: true });
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "share_revoked",
      at: Date.now(),
    });
  },
});
export const publicView = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const s = await ctx.db
      .query("shares")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!s || s.revoked || (s.expires !== undefined && s.expires <= Date.now()))
      return null;
    const owner = await ctx.db.get(s.athleteId);
    if (!owner || owner.status !== "active") return null;
    return projectShare(ctx, s.athleteId, s, owner.timezone);
  },
});

async function projectShare(
  ctx: QueryCtx,
  athleteId: Id<"athletes">,
  selection: Selection,
  timezone: string,
) {
  const zones = await ctx.db
    .query("privacyZones")
    .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
    .collect();
  const activities = [];
  // Old links may contain repeated IDs. Count each owned activity only once.
  for (const id of new Set(selection.activityIds)) {
    const a = await ctx.db.get(id);
    if (!a || a.athleteId !== athleteId) continue;
    const fields: Record<string, unknown> = {};
    for (const f of selection.fields) {
      if (f === "route")
        fields.route = (a.routeSegments ?? [a.route]).flatMap((segment) =>
          maskedRoute(segment as Point[], zones),
        );
      else if (f === "date") fields.date = dayKey(a.start, timezone);
      else if (f === "elevation")
        fields.elevation = a.summary.elevationGain ?? null;
      else if (
        f === "title" ||
        f === "sport" ||
        f === "distance" ||
        f === "duration"
      )
        fields[f] = a[f] ?? null;
    }
    activities.push(fields);
  }
  const totals: Record<
    string,
    {
      value: number | null;
      measuredCount: number;
      missingCount: number;
      unit: string;
    }
  > = {};
  if (["dashboard", "statistics"].includes(selection.kind)) {
    for (const field of ["distance", "duration", "elevation"]) {
      if (!selection.fields.includes(field)) continue;
      const values = activities
        .map((a) => a[field])
        .filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value),
        );
      totals[field] = {
        value: values.length
          ? values.reduce((sum, value) => sum + value, 0)
          : null,
        measuredCount: values.length,
        missingCount: activities.length - values.length,
        unit: field === "duration" ? "s" : "m",
      };
    }
  }
  return { kind: selection.kind, activities, totals };
}

export const preview = query({
  args: {
    kind: v.string(),
    activityIds: v.array(v.id("activities")),
    fields: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    if (!validSelection(args))
      throw new ConvexError("Select activities and fields to preview.");
    for (const id of args.activityIds) await ownedActivity(ctx, id);
    return projectShare(ctx, a._id, args, a.timezone);
  },
});
