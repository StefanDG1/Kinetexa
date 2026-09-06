"use node";
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { recordDeletion } from "./backups";
export const cleanupUnallocated = internalAction({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    if (!process.env.WORKOS_API_KEY) return;
    const page = await ctx.runQuery(internal.sessions.unallocatedPage, {
      cursor: cursor ?? null,
    });
    for (const row of page.page) {
      if (row.hasAthlete || !row.workosUserId) continue;
      try {
        const user = await fetch(
          `https://api.workos.com/user_management/users/${encodeURIComponent(row.workosUserId)}`,
          {
            headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
            signal: AbortSignal.timeout(15000),
          },
        );
        if (user.status !== 404) continue;
        await recordDeletion(undefined, row.workosUserId);
        await ctx.runMutation(internal.sessions.removeUnallocated, {
          id: row.id,
          workosUserId: row.workosUserId,
        });
      } catch {
        console.error(
          JSON.stringify({ event: "unallocated_session_cleanup_failed" }),
        );
      }
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.sessionActions.cleanupUnallocated,
        { cursor: page.continueCursor },
      );
  },
});
export const logout = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (
      !identity ||
      typeof identity.sid !== "string" ||
      !identity.sid ||
      identity.sid.length > 256
    )
      throw new ConvexError("No active AuthKit session.");
    // Persist denial before contacting WorkOS; a provider outage must not reopen API access.
    await ctx.runMutation(internal.sessions.revoke, {});
    if (!process.env.WORKOS_API_KEY)
      throw new ConvexError("Session provider is unavailable.");
    const response = await fetch(
      "https://api.workos.com/user_management/sessions/revoke",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WORKOS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: identity.sid }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) throw new ConvexError("Session provider is unavailable.");
    return { revoked: true };
  },
});
