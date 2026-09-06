import { v, ConvexError } from "convex/values";
import { internalMutation } from "./_generated/server";
// Operator-only migration for the enumerated file uploads that predate source-policy storage.
// New connectors must declare their policy at ingest; absence always remains blocked.
export const classifyLegacyUploads = internalMutation({
  args: { ids: v.array(v.id("sources")) },
  handler: async (ctx, { ids }) => {
    if (ids.length > 100)
      throw new ConvexError("Use a bounded migration batch.");
    let updated = 0;
    for (const id of ids) {
      const s = await ctx.db.get(id);
      if (!s || s.externalAi !== undefined) continue;
      if (
        s.createdAt > Date.parse("2026-09-06T13:30:00Z") ||
        !s.key.startsWith(`${s.athleteId}/originals/`)
      )
        throw new ConvexError(
          "This source is outside the legacy manual-upload migration.",
        );
      await ctx.db.patch(id, {
        externalAi: "allowed",
        aiPolicyVersion: "legacy-user-file-2026-09",
      });
      updated++;
    }
    return { updated };
  },
});
