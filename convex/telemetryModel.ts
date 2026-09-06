import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";

export const productEvents = [
  "account_created",
  "onboarding_completed",
  "provider_connect_started",
  "provider_connected",
  "import_started",
  "import_completed",
  "first_activity_processed",
  "first_dashboard_viewed",
  "first_activity_analyzed",
  "first_map_viewed",
  "first_ai_question_asked",
  "first_saved_analysis_created",
  "premium_checkout_started",
  "premium_activated",
  "premium_canceled",
  "dashboard_viewed",
  "activity_viewed",
  "date_range_changed",
  "metric_explanation_opened",
  "map_filter_applied",
  "analysis_query_run",
  "analysis_saved",
  "goal_created",
  "calendar_workout_planned",
  "gear_maintenance_created",
  "share_created",
  "share_revoked",
  "ai_question_asked",
  "ai_insight_opened",
  "map_viewed",
] as const;
export type ProductEvent = (typeof productEvents)[number];
export const productEvent = v.union(
  ...productEvents.map((event) => v.literal(event)),
);
const firstEvents: Partial<Record<ProductEvent, ProductEvent>> = {
  dashboard_viewed: "first_dashboard_viewed",
  activity_viewed: "first_activity_analyzed",
  map_viewed: "first_map_viewed",
  ai_question_asked: "first_ai_question_asked",
  analysis_saved: "first_saved_analysis_created",
};
export async function recordProductEvent(
  ctx: MutationCtx,
  athlete: Doc<"athletes">,
  event: ProductEvent,
) {
  if (athlete.status !== "active" || !athlete.analyticsConsent) return;
  if (event.startsWith("first_")) {
    const current = await ctx.db.get(athlete._id);
    const milestones = current?.productMilestones ?? [];
    if (milestones.includes(event)) return;
    await ctx.db.patch(athlete._id, {
      productMilestones: [...milestones, event],
    });
  }
  const id = await ctx.db.insert("productEvents", {
    athleteId: athlete._id,
    event,
    at: Date.now(),
    status: "queued",
    attempts: 0,
    consentRevision: athlete.analyticsConsentRevision ?? 0,
    uuid: crypto.randomUUID(),
  });
  await ctx.scheduler.runAfter(0, internal.telemetryActions.send, { id });
  const first = firstEvents[event];
  if (first) await recordProductEvent(ctx, athlete, first);
}
export function telemetryConfigured() {
  return (
    process.env.KINETEXA_TELEMETRY_ENABLED === "true" &&
    ["staging", "production"].includes(
      process.env.KINETEXA_ENVIRONMENT ?? "",
    ) &&
    Boolean(
      process.env.POSTHOG_PROJECT_TOKEN &&
      process.env.POSTHOG_SECRET_KEY &&
      process.env.POSTHOG_PROJECT_ID,
    )
  );
}
