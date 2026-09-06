import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAthlete } from "./athletes";
import {
  providerCatalog,
  requireProviderAvailable,
} from "../packages/core/providers";
export const catalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAthlete(ctx);
    return {
      providers: providerCatalog,
      fileImport: {
        available: true,
        formats: ["fit", "tcx", "gpx", "zip"],
        retainedOriginals: true,
      },
      persistentConnectionAvailable: false,
    };
  },
});
export const connect = mutation({
  args: {
    provider: v.union(
      v.literal("garmin"),
      v.literal("strava"),
      v.literal("polar"),
      v.literal("wahoo"),
      v.literal("coros"),
      v.literal("suunto"),
    ),
  },
  handler: async (ctx, { provider }) => {
    await requireAthlete(ctx);
    try {
      requireProviderAvailable(provider);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Provider unavailable.",
      );
    }
  },
});
