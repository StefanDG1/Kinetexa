import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { sessionHash } from "./sessionModel";
export const unallocatedPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const result = await ctx.db
      .query("revokedSessions")
      .withIndex("by_athlete", (q) => q.eq("athleteId", undefined))
      .paginate({ cursor, numItems: 25, maximumBytesRead: 1000000 });
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (row) => ({
          id: row._id,
          workosUserId: row.workosUserId,
          hasAthlete: row.workosUserId
            ? (await ctx.db
                .query("athletes")
                .withIndex("by_workos_user", (q) =>
                  q.eq("workosUserId", row.workosUserId!),
                )
                .unique()) !== null
            : true,
        })),
      ),
    };
  },
});
export const removeUnallocated = internalMutation({
  args: { id: v.id("revokedSessions"), workosUserId: v.string() },
  handler: async (ctx, { id, workosUserId }) => {
    const row = await ctx.db.get(id);
    if (!row || row.athleteId || row.workosUserId !== workosUserId) return;
    if (
      await ctx.db
        .query("athletes")
        .withIndex("by_workos_user", (q) => q.eq("workosUserId", workosUserId))
        .unique()
    )
      return;
    await ctx.db.delete(id);
  },
});
export const revoke = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to continue.");
    const hash = await sessionHash(identity);
    if (!hash) throw new ConvexError("This token has no AuthKit session.");
    const athlete = await ctx.db
      .query("athletes")
      .withIndex("by_workos_user", (q) =>
        q.eq("workosUserId", identity.subject),
      )
      .unique();
    const existing = await ctx.db
      .query("revokedSessions")
      .withIndex("by_session", (q) => q.eq("sessionHash", hash))
      .unique();
    if (existing) {
      if (existing.providerRevokedAt !== undefined)
        return { callProvider: false, providerRevoked: true };
      if (
        existing.providerAttemptAt !== undefined &&
        Date.now() - existing.providerAttemptAt < 60_000
      )
        return { callProvider: false, providerRevoked: false };
      await ctx.db.patch(existing._id, { providerAttemptAt: Date.now() });
      return { callProvider: true, providerRevoked: false };
    }
    await ctx.db.insert("revokedSessions", {
      ...(athlete ? { athleteId: athlete._id } : {}),
      workosUserId: identity.subject,
      sessionHash: hash,
      createdAt: Date.now(),
      providerAttemptAt: Date.now(),
    });
    if (athlete)
      await ctx.db.insert("auditEvents", {
        athleteId: athlete._id,
        action: "session_logged_out",
        at: Date.now(),
      });
    return { callProvider: true, providerRevoked: false };
  },
});

export const providerRevoked = internalMutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in to continue.");
    const hash = await sessionHash(identity);
    if (!hash) throw new ConvexError("This token has no AuthKit session.");
    const row = await ctx.db
      .query("revokedSessions")
      .withIndex("by_session", (q) => q.eq("sessionHash", hash))
      .unique();
    if (row && row.providerRevokedAt === undefined)
      await ctx.db.patch(row._id, { providerRevokedAt: Date.now() });
  },
});
