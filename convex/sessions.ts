import { ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
import { sessionHash } from "./sessionModel";
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
    if (!athlete) return;
    if (
      await ctx.db
        .query("revokedSessions")
        .withIndex("by_session", (q) => q.eq("sessionHash", hash))
        .unique()
    )
      return;
    await ctx.db.insert("revokedSessions", {
      athleteId: athlete._id,
      sessionHash: hash,
      createdAt: Date.now(),
    });
    await ctx.db.insert("auditEvents", {
      athleteId: athlete._id,
      action: "session_logged_out",
      at: Date.now(),
    });
  },
});
