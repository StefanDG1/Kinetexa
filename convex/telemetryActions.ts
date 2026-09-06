"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
export const send = internalAction({
  args: { id: v.id("productEvents") },
  handler: async (ctx, { id }) => {
    const row = await ctx.runMutation(internal.telemetry.claim, { id });
    if (!row) return;
    try {
      if (
        !(await ctx.runQuery(internal.telemetry.permitted, {
          id,
          attempt: row.attempt,
        }))
      ) {
        await ctx.runMutation(internal.telemetry.result, {
          id,
          attempt: row.attempt,
          failed: false,
          dropped: true,
        });
        return;
      }
      const response = await fetch("https://eu.i.posthog.com/i/v0/e/", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.POSTHOG_PROJECT_TOKEN,
          event: row.event,
          distinct_id: row.distinctId,
          uuid: row.uuid,
          timestamp: new Date(row.at).toISOString(),
          properties: {
            environment: process.env.KINETEXA_ENVIRONMENT,
            taxonomy_version: 1,
            $geoip_disable: true,
            $ip: null,
          },
        }),
      });
      if (!response.ok) throw new Error("Telemetry capture unavailable.");
      await ctx.runMutation(internal.telemetry.result, {
        id,
        attempt: row.attempt,
        failed: false,
      });
    } catch {
      await ctx.runMutation(internal.telemetry.result, {
        id,
        attempt: row.attempt,
        failed: true,
      });
    }
  },
});
export const erase = internalAction({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }): Promise<boolean> => {
    const context = await ctx.runQuery(internal.telemetry.deletionContext, {
      athleteId,
    });
    if (!context.transmitted) return true;
    if (
      !process.env.POSTHOG_SECRET_KEY ||
      !/^\d+$/.test(process.env.POSTHOG_PROJECT_ID ?? "")
    )
      throw new Error("Analytics deletion is not configured.");
    const host = `https://eu.posthog.com/api/projects/${process.env.POSTHOG_PROJECT_ID}`;
    const headers = {
      Authorization: `Bearer ${process.env.POSTHOG_SECRET_KEY}`,
      "Content-Type": "application/json",
    };
    const distinct = context.distinctId;
    if (!distinct) throw new Error("Analytics identity unavailable.");
    if (!context.requested) {
      const response = await fetch(`${host}/persons/bulk_delete/`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          distinct_ids: [distinct],
          delete_events: true,
          delete_recordings: true,
        }),
      });
      if (!response.ok) throw new Error("Analytics erasure unavailable.");
      const result = await response.json();
      if (!result.events_queued_for_deletion || result.deletion_errors?.length)
        throw new Error("Analytics erasure was not accepted.");
      await ctx.runMutation(internal.telemetry.deletionRequested, {
        athleteId,
      });
      return false;
    }
    // Query the exact pseudonymous identity, never infer erasure from HTTP acceptance.
    const response = await fetch(`${host}/query/`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: `SELECT count() FROM events WHERE distinct_id = '${distinct.replaceAll("'", "''")}'`,
        },
      }),
    });
    if (!response.ok)
      throw new Error("Analytics erasure verification unavailable.");
    const result = await response.json();
    const erased = result.results?.[0]?.[0] === 0;
    if (erased)
      await ctx.runMutation(internal.telemetry.deletionVerified, { athleteId });
    return erased;
  },
});
