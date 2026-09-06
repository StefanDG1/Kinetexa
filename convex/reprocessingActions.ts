"use node";
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getObject, putObject } from "./storage";
import { parseActivity, parseFitHealth } from "../packages/core/import";
import { aggregateHealthFile } from "../packages/core/health";
import { analyze } from "../packages/core/analytics";
import { clean } from "../packages/core/model";
import { route } from "../packages/core/geo";
export const source = internalAction({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const run = await ctx.runMutation(internal.reprocessing.claim, { id });
    if (!run) return;
    const {
      attempt,
      source,
      thresholds,
      timezone,
      healthEnabled,
      healthRevision,
    } = run;
    try {
      const bytes = await getObject(source.key);
      if (
        bytes.length !== source.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== source.hash
      )
        throw new Error(
          "The retained original failed its integrity check. Previous results are preserved.",
        );
      const healthRebuilt = /\.fit$/i.test(source.name) && healthEnabled;
      if (healthRebuilt) {
        const samples = aggregateHealthFile(
          await parseFitHealth(bytes),
          timezone,
        );
        for (let offset = 0; offset < samples.length; offset += 200)
          await ctx.runMutation(internal.reprocessing.stageHealth, {
            id,
            attempt,
            samples: samples.slice(offset, offset + 200),
          });
      }
      let parsed;
      if (source.activityId) {
        const activity = await parseActivity(source.name, bytes),
          metrics = analyze(activity, thresholds),
          { samples: _samples, ...summary } = activity,
          streamKey = `${source.athleteId}/streams/${id}-reprocess-${attempt}.json`;
        await putObject(
          streamKey,
          Buffer.from(JSON.stringify(activity)),
          "application/json",
        );
        parsed = {
          metrics,
          summary,
          route: route(activity.samples),
          streamKey,
        };
      }
      await ctx.runMutation(
        internal.reprocessing.finish,
        clean({
          id,
          attempt,
          healthRebuilt,
          healthRevision,
          parsed,
          thresholds,
          timezone,
        }),
      );
    } catch (e) {
      await ctx.runMutation(internal.reprocessing.fail, {
        id,
        attempt,
        retryable:
          e instanceof Error &&
          /timeout|ECONN|fetch failed|503|SlowDown/i.test(e.message),
        message:
          e instanceof Error && /integrity check/.test(e.message)
            ? e.message
            : "Could not rebuild this file. Previous results are preserved; safe temporary failures retry automatically.",
      });
      console.error(
        JSON.stringify({ event: "reprocessing_failed", sourceId: id, attempt }),
      );
    }
  },
});
