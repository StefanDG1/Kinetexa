import { v } from "convex/values";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { hasPremium } from "../packages/core/entitlements";
import {
  calculateProductKpis,
  validateKpiPeriod,
  type KpiAthlete,
} from "../packages/core/product-kpis";
import type { Id } from "./_generated/dataModel";

const cursor = v.union(v.string(), v.null());
export const athletes = internalQuery({
  args: { cursor },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("athletes")
      .paginate({ ...args, numItems: 50 });
    return {
      ...result,
      page: result.page
        .filter((a) => a.status === "active" && a.analyticsConsent)
        .map((a) => ({
          id: a._id,
          createdAt: a.createdAt,
          revision: a.analyticsConsentRevision ?? 0,
        })),
    };
  },
});
export const read = internalQuery({
  args: {
    athleteId: v.id("athletes"),
    revision: v.number(),
    kind: v.union(v.literal("sources"), v.literal("events")),
    cursor,
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.athleteId);
    if (
      !a ||
      a.status !== "active" ||
      !a.analyticsConsent ||
      (a.analyticsConsentRevision ?? 0) !== args.revision
    )
      return null;
    if (args.kind === "sources") {
      const result = await ctx.db
        .query("sources")
        .withIndex("by_athlete", (q) =>
          q.eq("athleteId", a._id).gte("createdAt", args.since),
        )
        .paginate({
          cursor: args.cursor,
          numItems: 100,
          maximumBytesRead: 2_000_000,
        });
      return {
        ...result,
        page: result.page.map((s) => ({
          createdAt: s.createdAt,
          receivedAt: s.receivedAt,
          completedAt: s.completedAt,
          status: s.status,
          child: Boolean(s.parentId),
          supported: /\.(fit|tcx|gpx|zip)$/i.test(s.name),
        })),
      };
    }
    const result = await ctx.db
      .query("productEvents")
      .withIndex("by_athlete", (q) =>
        q.eq("athleteId", a._id).gte("at", args.since),
      )
      .paginate({ cursor: args.cursor, numItems: 500 });
    return {
      ...result,
      page: result.page
        .filter(
          (e) => e.consentRevision === args.revision && e.status !== "dropped",
        )
        .map((e) => ({ event: e.event, at: e.at })),
    };
  },
});
export const state = internalQuery({
  args: { athleteId: v.id("athletes"), revision: v.number() },
  handler: async (ctx, { athleteId, revision }) => {
    const a = await ctx.db.get(athleteId);
    if (
      !a ||
      a.status !== "active" ||
      !a.analyticsConsent ||
      (a.analyticsConsentRevision ?? 0) !== revision
    )
      return null;
    const billing = await ctx.db
      .query("billing")
      .withIndex("by_athlete", (q) => q.eq("athleteId", athleteId))
      .unique();
    const activities = await ctx.db
      .query("activities")
      .withIndex("by_athlete_created", (q) =>
        q.eq("athleteId", athleteId).eq("mergedInto", undefined),
      )
      .take(5);
    return {
      premium: hasPremium(billing),
      activityCreatedAt: activities.map((a) => a.createdAt),
    };
  },
});
export const report = internalAction({
  args: { from: v.number(), to: v.number() },
  handler: async (
    ctx,
    { from, to },
  ): Promise<
    ReturnType<typeof calculateProductKpis> & { readStartedAt: number }
  > => {
    const readStartedAt = Date.now();
    validateKpiPeriod(from, to, readStartedAt);
    const rows: KpiAthlete[] = [];
    let next: string | null = null;
    do {
      const page: {
        page: { id: Id<"athletes">; createdAt: number; revision: number }[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.productKpis.athletes, { cursor: next });
      for (const a of page.page) {
        const row: KpiAthlete = {
          createdAt: a.createdAt,
          premium: false,
          activityCreatedAt: [],
          sources: [],
          events: [],
        };
        for (const kind of ["sources", "events"] as const) {
          let position: string | null = null;
          do {
            const batch: {
              page: KpiAthlete["sources"] | KpiAthlete["events"];
              isDone: boolean;
              continueCursor: string;
            } | null = await ctx.runQuery(internal.productKpis.read, {
              athleteId: a.id,
              revision: a.revision,
              kind,
              cursor: position,
              since: kind === "sources" ? 0 : readStartedAt - 90 * 86400000,
            });
            if (!batch) break;
            if (kind === "sources")
              row.sources.push(...(batch.page as KpiAthlete["sources"]));
            else row.events.push(...(batch.page as KpiAthlete["events"]));
            position = batch.isDone ? null : batch.continueCursor;
          } while (position);
        }
        // Recheck after the paginated reads. Withdrawal invalidates this account's contribution.
        const state = await ctx.runQuery(internal.productKpis.state, {
          athleteId: a.id,
          revision: a.revision,
        });
        if (state) rows.push({ ...row, ...state });
      }
      next = page.isDone ? null : page.continueCursor;
    } while (next);
    return {
      ...calculateProductKpis(rows, from, to, Date.now()),
      readStartedAt,
    };
  },
});
