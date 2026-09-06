import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { QueryCtx } from "./_generated/server";

export async function requireAthlete(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to continue.");
  const athlete = await ctx.db
    .query("athletes")
    .withIndex("by_workos_user", (q) => q.eq("workosUserId", identity.subject))
    .unique();
  if (!athlete || athlete.status !== "active") {
    throw new ConvexError("Your account is unavailable.");
  }
  return athlete;
}

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const athlete = await ctx.db
      .query("athletes")
      .withIndex("by_workos_user", (q) =>
        q.eq("workosUserId", identity.subject),
      )
      .unique();
    if (!athlete || athlete.status !== "active") return null;
    const {
      tokenIdentifier: _token,
      workosUserId: _user,
      factsReady: _factsReady,
      factsCursor: _factsCursor,
      ...profile
    } = athlete;
    return profile;
  },
});

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to continue.");
    const existing = await ctx.db
      .query("athletes")
      .withIndex("by_workos_user", (q) =>
        q.eq("workosUserId", identity.subject),
      )
      .unique();
    if (existing) {
      if (existing.status !== "active")
        throw new ConvexError("Your account is being deleted.");
      return existing._id;
    }
    const now = Date.now();
    const id = await ctx.db.insert("athletes", {
      tokenIdentifier: identity.tokenIdentifier,
      workosUserId: identity.subject,
      displayName: identity.givenName ?? identity.name ?? "Athlete",
      timezone: "UTC",
      units: "metric",
      aiConsent: false,
      analyticsConsent: false,
      consentUpdatedAt: now,
      onboarded: false,
      status: "active",
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.email.enqueue, {
      athleteId: id,
      template: "welcome",
      dedupeKey: `welcome-${id}`,
    });
    return id;
  },
});

export const updateProfile = mutation({
  args: {
    displayName: v.string(),
    timezone: v.string(),
    units: v.union(v.literal("metric"), v.literal("imperial")),
    aiConsent: v.boolean(),
    analyticsConsent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const athlete = await requireAthlete(ctx);
    if (args.units !== "metric")
      throw new ConvexError("V1 currently supports metric units.");
    const displayName = args.displayName.trim();
    if (!displayName || displayName.length > 80)
      throw new ConvexError("Use a name between 1 and 80 characters.");
    try {
      new Intl.DateTimeFormat("en", { timeZone: args.timezone }).format();
    } catch {
      throw new ConvexError("Choose a valid time zone.");
    }
    const at = Date.now();
    await ctx.db.patch(athlete._id, {
      ...args,
      displayName,
      onboarded: true,
      consentUpdatedAt: at,
      aiConsentRevision:
        (athlete.aiConsentRevision ?? 0) +
        Number(athlete.aiConsent !== args.aiConsent),
    });
    await ctx.db.insert("auditEvents", {
      athleteId: athlete._id,
      action: "profile_and_consent_updated",
      at,
    });
    if (args.aiConsent && !athlete.aiConsent && athlete.insightConsent)
      await ctx.scheduler.runAfter(1000, internal.aiActions.refreshInsight, {
        athleteId: athlete._id,
      });
    if (args.timezone !== athlete.timezone)
      await ctx.scheduler.runAfter(0, internal.reprocessing.page, {
        athleteId: athlete._id,
        cursor: null,
      });
  },
});
