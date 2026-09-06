import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { collectActivities } from "./activityData";
import { querySchema, runQuery } from "../packages/core/query";
export const preview = action({
  args: { query: v.any() },
  handler: async (ctx, args): Promise<ReturnType<typeof runQuery>> => {
    const permission = await ctx.runMutation(api.workspace.authorizeQuery, {});
    const input = querySchema.parse(args.query),
      rows = await collectActivities(ctx, {
        from: input.from,
        to: input.to,
        sport: input.sport,
      });
    const result = runQuery(rows, input);
    await ctx.runMutation(internal.telemetry.queryCompleted, permission);
    return result;
  },
});
