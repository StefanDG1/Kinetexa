import type { UserIdentity } from "convex/server";
import type { QueryCtx } from "./_generated/server";

export async function sessionHash(identity: UserIdentity) {
  if (
    typeof identity.sid !== "string" ||
    !identity.sid ||
    identity.sid.length > 256
  )
    return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity.sid),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function sessionRevoked(ctx: QueryCtx, identity: UserIdentity) {
  const hash = await sessionHash(identity);
  return (
    hash !== null &&
    (await ctx.db
      .query("revokedSessions")
      .withIndex("by_session", (q) => q.eq("sessionHash", hash))
      .unique()) !== null
  );
}
