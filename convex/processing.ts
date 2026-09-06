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
import { parseActivity, unpackArchive } from "../packages/core/import";
import { analyze } from "../packages/core/analytics";
import { clean } from "../packages/core/model";
import { route } from "../packages/core/geo";

export const stream = action({
  args: { id: v.id("activities") },
  handler: async (
    ctx,
    args,
  ): Promise<import("../packages/core/model").Activity> => {
    const a = await ctx.runQuery(api.activities.get, args);
    return JSON.parse(new TextDecoder().decode(await getObject(a.streamKey)));
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
    const { source: s, thresholds } = claimed;
    try {
      const size = await objectSize(s.key);
      if (size !== s.bytes)
        throw new Error(
          "Uploaded byte count does not match. Upload the original again.",
        );
      const bytes = await getObject(s.key),
        hash = createHash("sha256").update(bytes).digest("hex");
      if (/\.zip$/i.test(s.name)) {
        const files = unpackArchive(bytes);
        for (const f of files) {
          const childHash = createHash("sha256").update(f.bytes).digest("hex"),
            key = `${s.athleteId}/originals/${childHash}`;
          await putObject(key, f.bytes);
          await ctx.runMutation(internal.imports.child, {
            parentId: id,
            name: f.name,
            key,
            bytes: f.bytes.length,
            hash: childHash,
          });
        }
        await ctx.runMutation(internal.imports.archiveComplete, { id, hash });
      } else {
        const activity = await parseActivity(s.name, bytes),
          metrics = analyze(activity, thresholds),
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
