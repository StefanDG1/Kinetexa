"use node";
import { createHash, randomUUID } from "node:crypto";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  getObject,
  putObject,
  putActivity,
  uploadUrl,
  downloadUrl,
  objectSize,
  removeObject,
} from "./storage";
import {
  parseActivity,
  unpackArchive,
  parseFitHealth,
  activityPartCount,
} from "../packages/core/import";
import { analyze } from "../packages/core/analytics";
import { clean } from "../packages/core/model";
import { streamView } from "../packages/core/stream-view";
import { route, routeSegments } from "../packages/core/geo";
import { aggregateHealthFile } from "../packages/core/health";
import { withTimeContext } from "../packages/core/time-context";
import { analyzeInterval } from "../packages/core/interval";

export const stream = action({
  args: {
    id: v.id("activities"),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<import("../packages/core/model").Activity> => {
    const a = await ctx.runQuery(api.activities.get, { id: args.id });
    if (
      [args.from, args.to].some(
        (n) => n !== undefined && (!Number.isFinite(n) || n < 0 || n > 172800),
      ) ||
      (args.from !== undefined && args.to !== undefined && args.from > args.to)
    )
      throw new ConvexError("Choose valid stream bounds within the recording.");
    const activity: import("../packages/core/model").Activity = JSON.parse(
      new TextDecoder().decode(await getObject(a.streamKey)),
    );
    return {
      ...activity,
      samples: streamView(
        activity.samples,
        args.from ?? 0,
        args.to ?? activity.duration,
      ),
    };
  },
});

export const canonical = action({
  args: { id: v.id("activities") },
  handler: async (ctx, { id }): Promise<string> => {
    const activity = await ctx.runQuery(api.activities.get, { id });
    return downloadUrl(activity.streamKey);
  },
});
export const interval = action({
  args: { id: v.id("activities"), from: v.number(), to: v.number() },
  handler: async (
    ctx,
    { id, from, to },
  ): Promise<ReturnType<typeof analyzeInterval>> => {
    const row = await ctx.runQuery(api.activities.get, { id });
    const profile = await ctx.runQuery(api.athletes.current, {});
    if (!profile) throw new Error("Account unavailable.");
    const activity = JSON.parse(
      new TextDecoder().decode(await getObject(row.streamKey)),
    );
    return clean(analyzeInterval(activity, from, to, profile.thresholds ?? {}));
  },
});

export const prepare = action({
  args: { name: v.string(), bytes: v.number() },
  handler: async (ctx, args): Promise<{ id: string; url: string }> => {
    const id = await ctx.runMutation(api.imports.reserve, {
      ...args,
      nonce: randomUUID(),
    });
    const s = await ctx.runQuery(api.imports.owned, { id });
    return { id, url: await uploadUrl(s.key, args.bytes) };
  },
});
export const original = action({
  args: { id: v.id("sources") },
  handler: async (ctx, args): Promise<string> => {
    const s = await ctx.runQuery(api.imports.owned, args);
    return downloadUrl(s.key);
  },
});
export const process = internalAction({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const claimed = await ctx.runMutation(internal.imports.claim, { id });
    if (!claimed) return;
    const { source: s, thresholds, timezone } = claimed;
    const attempt = s.attempts + 1;
    try {
      const size = await objectSize(s.key);
      if (size !== s.bytes)
        throw new Error(
          "Uploaded byte count does not match. Upload the original again.",
        );
      const bytes = await getObject(s.key),
        hash = createHash("sha256").update(bytes).digest("hex");
      if (bytes.length !== s.bytes || (s.hash && hash !== s.hash))
        throw new Error(
          "The retained original failed its integrity check. Previous results are preserved.",
        );
      // Browser upload URLs never target retained originals. Parse the same bytes that are sealed here.
      const key = `${s.athleteId}/originals/${hash}`;
      if (s.key !== key) await putObject(key, bytes);
      if (
        !(await ctx.runMutation(internal.imports.received, {
          id,
          hash,
          key,
          expectedKey: s.key,
          attempt,
        }))
      )
        return;
      s.key = key;
      if (/\.zip$/i.test(s.name)) {
        const files = await unpackArchive(bytes);
        const childIds: import("./_generated/dataModel").Id<"sources">[] = [];
        for (const f of files) {
          const childHash = createHash("sha256").update(f.bytes).digest("hex"),
            key = `${s.athleteId}/originals/${childHash}`;
          await putObject(key, f.bytes);
          childIds.push(
            await ctx.runMutation(
              internal.imports.child,
              clean({
                parentId: id,
                attempt,
                name: f.name,
                key,
                bytes: f.bytes.length,
                hash: childHash,
                importMetadata: f.metadata,
              }),
            ),
          );
        }
        await ctx.runMutation(internal.imports.archiveComplete, {
          id,
          attempt,
          hash,
          childIds,
        });
      } else {
        const health =
          /\.fit$/i.test(s.name) && s.partIndex === undefined
            ? aggregateHealthFile(await parseFitHealth(bytes), timezone)
            : [];
        for (let offset = 0; offset < health.length; offset += 200)
          await ctx.runMutation(internal.imports.health, {
            id,
            attempt,
            hash,
            samples: health.slice(offset, offset + 200),
          });
        if (s.partIndex === undefined) {
          const count = await activityPartCount(s.name, bytes);
          if (count > 1) {
            const childIds: import("./_generated/dataModel").Id<"sources">[] =
              [];
            for (let partIndex = 0; partIndex < count; partIndex++) {
              const dot = s.name.lastIndexOf("."),
                name = `${s.name.slice(0, dot)} (part ${partIndex + 1})${s.name.slice(dot)}`;
              childIds.push(
                await ctx.runMutation(
                  internal.imports.child,
                  clean({
                    parentId: id,
                    attempt,
                    name,
                    key: s.key,
                    bytes: s.bytes,
                    hash,
                    partIndex,
                    importMetadata: s.importMetadata,
                  }),
                ),
              );
            }
            await ctx.runMutation(internal.imports.archiveComplete, {
              id,
              attempt,
              hash,
              childIds,
            });
            return;
          }
        }
        let activity;
        try {
          activity = withTimeContext(
            await parseActivity(s.name, bytes, s.partIndex),
            timezone,
          );
        } catch (e) {
          if (
            health.length &&
            e instanceof Error &&
            /No valid/.test(e.message)
          ) {
            await ctx.runMutation(internal.imports.healthComplete, {
              id,
              attempt,
              hash,
            });
            return;
          }
          throw e;
        }
        const metrics = analyze(activity, thresholds),
          streamKey = `${s.athleteId}/streams/${id}-import-${attempt}.json`;
        await putActivity(streamKey, activity);
        const { samples: _samples, ...summary } = activity;
        await ctx.runMutation(
          internal.imports.complete,
          clean({
            id,
            attempt,
            hash,
            summary,
            metrics,
            route: route(activity.samples),
            routeSegments: routeSegments(activity.samples),
            streamKey,
          }),
        );
      }
      console.info(
        JSON.stringify({
          event: "import_completed",
          jobId: id,
          bytes: s.bytes,
        }),
      );
    } catch (e) {
      const retryable =
        e instanceof Error &&
        /timeout|ECONN|fetch failed|503|SlowDown/i.test(e.message);
      const message = retryable
        ? "Storage is temporarily unavailable. Retrying."
        : e instanceof Error &&
            /limit|malformed|invalid|contains|No valid|Choose|Uploaded|entities|48 hours/.test(
              e.message,
            )
          ? e.message
          : "This file could not be processed. The original is retained.";
      await ctx.runMutation(internal.imports.failed, {
        id,
        attempt,
        message,
        retryable,
      });
      console.error(
        JSON.stringify({ event: "import_failed", jobId: id, retryable }),
      );
    }
  },
});
export const removeUpload = internalAction({
  args: { id: v.id("sources") },
  handler: async (ctx, { id }) => {
    const key = await ctx.runQuery(internal.imports.uploadCleanup, { id });
    if (!key) return;
    await removeObject(key);
    await ctx.runMutation(internal.imports.uploadRemoved, { id, key });
  },
});
