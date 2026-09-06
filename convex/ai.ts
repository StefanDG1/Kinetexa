import { ConvexError, v } from "convex/values";
import { mutation, internalMutation, query } from "./_generated/server";
import { requireAthlete } from "./athletes";
import { rateLimit } from "./limits";
export const begin = mutation({
  args: { question: v.string() },
  handler: async (ctx, { question }) => {
    const a = await requireAthlete(ctx);
    if (!a.aiConsent)
      throw new ConvexError(
        "AI is off. Enable it in Settings to ask a question.",
      );
    if (!question.trim() || question.length > 1500)
      throw new ConvexError("Use a question up to 1,500 characters.");
    await rateLimit(ctx, a._id, "ai-minute", 3, 60000);
    const b = await ctx.db
        .query("billing")
        .withIndex("by_athlete", (q) => q.eq("athleteId", a._id))
        .unique(),
      limit = b && ["active", "trialing"].includes(b.status) ? 200 : 10,
      window = new Date().toISOString().slice(0, 7);
    const u = await ctx.db
      .query("usage")
      .withIndex("by_athlete", (q) =>
        q.eq("athleteId", a._id).eq("kind", "ai-month").eq("window", window),
      )
      .unique();
    if ((u?.count ?? 0) >= limit)
      throw new ConvexError(
        "Your monthly AI allowance is used. Core analytics remain available.",
      );
    if (u) await ctx.db.patch(u._id, { count: u.count + 1 });
    else
      await ctx.db.insert("usage", {
        athleteId: a._id,
        kind: "ai-month",
        window,
        count: 1,
      });
    await ctx.db.insert("messages", {
      athleteId: a._id,
      role: "user",
      content: question,
      at: Date.now(),
    });
    return { athleteId: a._id, consentAt: a.consentUpdatedAt };
  },
});
export const consent = query({
  args: {},
  handler: async (ctx) => {
    const a = await requireAthlete(ctx);
    if (!a.aiConsent) throw new ConvexError("AI consent is off.");
    return { at: a.consentUpdatedAt };
  },
});
export const finish = internalMutation({
  args: { athleteId: v.id("athletes"), content: v.string(), evidence: v.any() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.athleteId);
    if (!a || !a.aiConsent || a.status !== "active") return;
    await ctx.db.insert("messages", {
      ...args,
      role: "assistant",
      at: Date.now(),
    });
  },
});
