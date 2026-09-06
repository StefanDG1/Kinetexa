import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAthlete } from "./athletes";
import { ownedActivity } from "./activities";
import { maskedRoute, type Point } from "../packages/core/geo";
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
      !["activity", "dashboard", "statistics", "map"].includes(args.kind) ||
      !args.activityIds.length ||
      args.activityIds.length > 100 ||
      args.fields.some((f) => !allowed.includes(f)) ||
      (args.expires !== undefined && args.expires < Date.now())
    )
      throw new ConvexError("Check the shared fields and expiry.");
    for (const id of args.activityIds) await ownedActivity(ctx, id);
    await ctx.db.insert("auditEvents", {
      athleteId: a._id,
      action: "share_created",
      at: Date.now(),
    });
    return ctx.db.insert("shares", {
      ...args,
      athleteId: a._id,
      revoked: false,
      createdAt: Date.now(),
    });
  },
});
export const revoke = mutation({
  args: { id: v.id("shares") },
  handler: async (ctx, { id }) => {
    const a = await requireAthlete(ctx),
      s = await ctx.db.get(id);
    if (s?.athleteId !== a._id) throw new ConvexError("Share unavailable.");
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
    if (!s || s.revoked || (s.expires !== undefined && s.expires < Date.now()))
      return null;
    const owner = await ctx.db.get(s.athleteId);
    if (!owner || owner.status !== "active") return null;
    return projectShare(ctx, s.athleteId, s);
  },
});

async function projectShare(
  ctx: QueryCtx,
  athleteId: Id<"athletes">,
  selection: {
    activityIds: Id<"activities">[];
    fields: string[];
    kind: string;
  },
) {
  const zones = await ctx.db
    .query("privacyZones")
    .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
    .collect();
  const activities = [];
  for (const id of selection.activityIds) {
    const a = await ctx.db.get(id);
    if (!a || a.athleteId !== athleteId) continue;
    const fields: Record<string, unknown> = {};
    for (const f of selection.fields) {
      if (f === "route") fields.route = maskedRoute(a.route as Point[], zones);
      else if (f === "date")
        fields.date = new Date(a.start).toISOString().slice(0, 10);
      else if (f === "elevation")
        fields.elevation = a.summary.elevationGain ?? null;
      else fields[f] = (a as any)[f] ?? null;
    }
    activities.push(fields);
  }
  return { kind: selection.kind, activities };
}

export const preview = query({
  args: {
    kind: v.string(),
    activityIds: v.array(v.id("activities")),
    fields: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const a = await requireAthlete(ctx);
    if (
      !args.activityIds.length ||
      args.activityIds.length > 100 ||
      !args.fields.length ||
      args.fields.some((f) => !allowed.includes(f))
    )
      throw new ConvexError("Select activities and fields to preview.");
    for (const id of args.activityIds) await ownedActivity(ctx, id);
    return projectShare(ctx, a._id, args);
  },
});
