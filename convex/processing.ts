"use node";
import { createHash, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import {
  getObject,
  putObject,
  uploadUrl,
  downloadUrl,
  objectSize,
} from "./storage";
import {
  parseActivity,
  unpackArchive,
  parseFitHealth,
} from "../packages/core/import";
import { analyze } from "../packages/core/analytics";
import { clean } from "../packages/core/model";
import { route } from "../packages/core/geo";
import { aggregateHealthFile } from "../packages/core/health";

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
    const activity: import("../packages/core/model").Activity = JSON.parse(
      new TextDecoder().decode(await getObject(a.streamKey)),
    );
    const selected = activity.samples.filter(
      (s) => s.t >= (args.from ?? 0) && s.t <= (args.to ?? activity.duration),
    );
    const step = Math.max(1, Math.ceil(selected.length / 2000));
    return {
      ...activity,
      samples: selected.filter(
        (_, i) => i % step === 0 || i === selected.length - 1,
      ),
    };
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
    try {
      const size = await objectSize(s.key);
      if (size !== s.bytes)
        throw new Error(
          "Uploaded byte count does not match. Upload the original again.",
        );
      const bytes = await getObject(s.key),
        hash = createHash("sha256").update(bytes).digest("hex");
      await ctx.runMutation(internal.imports.received, { id, hash });
      if (/\.zip$/i.test(s.name)) {
        const files = unpackArchive(bytes);
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
          hash,
          childIds,
        });
      } else {
        const health = /\.fit$/i.test(s.name)
          ? aggregateHealthFile(await parseFitHealth(bytes), timezone)
          : [];
        for (let offset = 0; offset < health.length; offset += 200)
          await ctx.runMutation(internal.imports.health, {
            id,
            hash,
            samples: health.slice(offset, offset + 200),
          });
        let activity;
        try {
          activity = await parseActivity(s.name, bytes);
        } catch (e) {
          if (
            health.length &&
            e instanceof Error &&
            /No valid/.test(e.message)
          ) {
            await ctx.runMutation(internal.imports.healthComplete, {
              id,
              hash,
            });
            return;
          }
          throw e;
        }
        const metrics = analyze(activity, thresholds),
          streamKey = `${s.athleteId}/streams/${id}.json`;
        await putObject(
          streamKey,
          Buffer.from(JSON.stringify(activity)),
          "application/json",
        );
        const { samples: _samples, ...summary } = activity;
        await ctx.runMutation(
          internal.imports.complete,
          clean({
            id,
            hash,
            summary,
            metrics,
            route: route(activity.samples),
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
        message,
        retryable,
      });
      console.error(
        JSON.stringify({ event: "import_failed", jobId: id, retryable }),
      );
    }
  },
});
