import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  athletes: defineTable({
    tokenIdentifier: v.string(),
    workosUserId: v.string(),
    displayName: v.string(),
    timezone: v.string(),
    units: v.union(v.literal("metric"), v.literal("imperial")),
    aiConsent: v.boolean(),
    analyticsConsent: v.boolean(),
    consentUpdatedAt: v.number(),
    onboarded: v.boolean(),
    status: v.union(v.literal("active"), v.literal("deleting")),
    createdAt: v.number(),
  })
    .index("by_identity", ["tokenIdentifier"])
    .index("by_workos_user", ["workosUserId"]),
  auditEvents: defineTable({
    athleteId: v.id("athletes"),
    action: v.string(),
    at: v.number(),
  }).index("by_athlete", ["athleteId", "at"]),
});
