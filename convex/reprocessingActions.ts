"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getObject, putObject } from "./storage";
import { parseActivity } from "../packages/core/import";
import { analyze } from "../packages/core/analytics";
import { VERSION, clean } from "../packages/core/model";
import { route } from "../packages/core/geo";
export const activity = internalAction({
  args: { id: v.id("activities") },
  handler: async (ctx, { id }) => {
    const current = await ctx.runQuery(internal.reprocessing.get, { id });
    if (!current?.source) return;
    const parsed = await parseActivity(
        current.source.name,
        await getObject(current.source.key),
      ),
      metrics = analyze(parsed, current.thresholds),
      { samples: _samples, ...summary } = parsed;
    await putObject(
      current.activity.streamKey,
      Buffer.from(JSON.stringify(parsed)),
      "application/json",
    );
    await ctx.runMutation(
      internal.reprocessing.save,
      clean({
        id,
        metrics,
        summary,
        route: route(parsed.samples),
        version: VERSION,
      }),
    );
  },
});
