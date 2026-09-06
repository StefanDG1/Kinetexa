import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { collectActivities } from "./activityData";
import { querySchema, runQuery } from "../packages/core/query";
export const preview = action({
  args: { query: v.any() },
  handler: async (ctx, args): Promise<ReturnType<typeof runQuery>> => {
    await ctx.runMutation(api.workspace.authorizeQuery, {});
    const input = querySchema.parse(args.query),
      rows = await collectActivities(ctx, {
        from: input.from,
        to: input.to,
        sport: input.sport,
      });
    return runQuery(rows, input);
  },
});
