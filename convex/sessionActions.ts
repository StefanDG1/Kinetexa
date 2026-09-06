import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
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
