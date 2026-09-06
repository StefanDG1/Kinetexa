"use node";
import { PassThrough } from "node:stream";
import { createHash } from "node:crypto";
import { Zip, ZipPassThrough } from "fflate";
import { Upload } from "@aws-sdk/lib-storage";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { client, putObject, downloadUrl, removeObject } from "./storage";
import { exportTables } from "./exports";
import { EXPORT_RETENTION_MS } from "./exportModel";
import type { Doc } from "./_generated/dataModel";
function safeName(name: string) {
  const base = name
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)!
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/, "");
  return !base || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)
    ? `original-${base || "file"}`
    : base;
}
export const run = internalAction({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }): Promise<void> => {
    const claimed = await ctx.runMutation(internal.exports.claim, { id });
    if (!claimed) return;
    const { job, athlete } = claimed,
      startedAt = Date.now(),
      key = `${athlete._id}/exports/${id}/part-${job.partCount ?? 0}-attempt-${job.lease}.zip`;
    let position = job.position ?? { table: 0, cursor: null, page: 0 },
      bytes = 0;
    const digest = createHash("sha256"),
      stream = new PassThrough(),
      s3 = client();
    // Keep emitted ZIP bytes bounded by the upload stream's backpressure.
    stream.on("error", () => {});
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: stream,
        ContentType: "application/zip",
      },
      queueSize: 1,
      partSize: 5 * 1024 * 1024,
    });
    const uploaded = upload.done();
    uploaded.catch(() => {});
    const zip = new Zip((error, data, final) => {
      if (error) {
        stream.destroy(error);
        return;
      }
      bytes += data.byteLength;
      digest.update(data);
      stream.write(data);
      if (final) stream.end();
    });
    const drain = async () => {
      if (stream.destroyed) throw new Error("Export upload interrupted.");
      if (stream.writableNeedDrain)
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            stream.off("drain", done);
            stream.off("error", fail);
            stream.off("close", closed);
          };
          const done = () => {
            cleanup();
            resolve();
          };
          const fail = (e: Error) => {
            cleanup();
            reject(e);
          };
          const closed = () => fail(new Error("Export stream closed."));
          stream.once("drain", done);
          stream.once("error", fail);
          stream.once("close", closed);
        });
    };
    const add = (name: string, data: Uint8Array) => {
      const entry = new ZipPassThrough(name);
      zip.add(entry);
      entry.push(data, true);
    };
    const addObject = async (
      name: string,
      objectKey: string,
      expectedHash?: string,
    ) => {
      const r = await s3.send(
        new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: objectKey }),
        { abortSignal: AbortSignal.timeout(120000) },
      );
      if (!r.Body) throw new Error("Export source unavailable.");
      const entry = new ZipPassThrough(name),
        hash = createHash("sha256");
      zip.add(entry);
      for await (const chunk of r.Body as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        entry.push(chunk, false);
        await drain();
      }
      if (expectedHash && hash.digest("hex") !== expectedHash)
        throw new Error("Original checksum mismatch.");
      entry.push(new Uint8Array(), true);
      await drain();
    };
    try {
      if (!job.partCount) {
        const {
          tokenIdentifier: _token,
          workosUserId: _user,
          ...profile
        } = athlete;
        add("profile.json", Buffer.from(JSON.stringify(profile)));
      }
      add(
        `README-part-${job.partCount ?? 0}.txt`,
        Buffer.from(
          "Kinetexa machine-readable account export. Extract every ZIP part into the same directory. SI units; UTC millisecond timestamps. Originals are unchanged. Each metadata page records its read time; an export covers a read window, not a single database transaction. Avoid editing/importing while exporting when a stable point-in-time copy is needed. The download API supplies part SHA-256 checksums.",
        ),
      );
      while (position.table < exportTables.length) {
        const table = exportTables[position.table];
        const page = await ctx.runQuery(internal.exports.page, {
          id,
          lease: job.lease,
          table: position.table,
          cursor: position.cursor,
        });
        add(
          `data/${table}-${position.page}.json`,
          Buffer.from(JSON.stringify(page.page)),
        );
        add(
          `metadata/${table}-${position.page}.json`,
          Buffer.from(
            JSON.stringify({ readAt: Date.now(), requestedAt: job.createdAt }),
          ),
        );
        for (const row of page.page as any[]) {
          if (table === "sources" && row.status !== "awaiting-upload")
            await addObject(
              `originals/${row._id}/${safeName(row.name)}`,
              row.key,
              row.hash,
            );
          if (table === "activities")
            await addObject(`canonical/${row._id}.json`, row.streamKey);
          if (table === "metricHistory" && row.streamKey)
            await addObject(`canonical-history/${row._id}.json`, row.streamKey);
        }
        await drain();
        position = page.isDone
          ? { table: position.table + 1, cursor: null, page: 0 }
          : {
              ...position,
              cursor: page.continueCursor,
              page: position.page + 1,
            };
        if (bytes >= 64 * 1024 * 1024 || Date.now() - startedAt >= 30000) break;
      }
      zip.end();
      await uploaded;
      const published = await ctx.runMutation(internal.exports.checkpoint, {
        id,
        lease: job.lease,
        key,
        bytes,
        sha256: digest.digest("hex"),
        position,
        done: position.table === exportTables.length,
      });
      if (!published) await removeObject(key);
    } catch {
      zip.terminate();
      stream.destroy();
      await upload.abort().catch(() => {});
      await removeObject(key).catch(() => {});
      await ctx.runMutation(internal.exports.fail, { id, lease: job.lease });
      console.error(
        JSON.stringify({
          event: "export_part_failed",
          jobId: id,
          attempt: job.lease,
        }),
      );
    }
  },
});
export const finalize = internalAction({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }): Promise<void> => {
    const context = await ctx.runQuery(internal.lifecycle.context, { id });
    if (
      context?.job.status !== "finalizing" ||
      context.athlete.status !== "active"
    )
      return;
    let cursor: string | null = null;
    const parts: Doc<"exportParts">[] = [];
    do {
      const page: {
        page: Doc<"exportParts">[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.exports.parts, { id, cursor });
      parts.push(...page.page);
      cursor = page.isDone ? null : page.continueCursor;
    } while (cursor);
    if (parts.length !== context.job.partCount)
      throw new Error("Export parts incomplete.");
    const manifestKey = `${context.athlete._id}/exports/${id}/manifest.json`;
    await putObject(
      manifestKey,
      Buffer.from(
        JSON.stringify({
          format: "kinetexa-export-1",
          requestedAt: context.job.createdAt,
          finishedAt: Date.now(),
          expiresAt: context.job.expiresAt,
          consistency:
            "Each metadata page records its read time. Extract every ZIP part together.",
          parts: parts.map((p) => ({
            index: p.index,
            name: p.key.split("/").at(-1),
            bytes: p.bytes,
            sha256: p.sha256,
          })),
        }),
      ),
      "application/json",
    );
    const completed = await ctx.runMutation(internal.exports.complete, {
      id,
      key: parts.length === 1 ? parts[0].key : manifestKey,
    });
    if (!completed) await removeObject(manifestKey);
  },
});
export const downloadPart = action({
  args: { id: v.id("lifecycleJobs"), index: v.number() },
  handler: async (ctx, args): Promise<string> => {
    const job = await ctx.runQuery(api.lifecycle.owned, { id: args.id });
    if (
      job.kind !== "export" ||
      job.status !== "complete" ||
      (job.expiresAt ?? job.createdAt + EXPORT_RETENTION_MS) <= Date.now()
    )
      throw new ConvexError("Export unavailable or expired.");
    const part = await ctx.runQuery(internal.exports.part, args);
    if (!part) throw new ConvexError("Export part unavailable.");
    return downloadUrl(part.key);
  },
});
export const cleanup = internalAction({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const context = await ctx.runQuery(internal.lifecycle.context, { id });
    if (
      !context ||
      context.job.kind !== "export" ||
      !["expiring", "expired"].includes(context.job.status)
    )
      return;
    const s3 = client(),
      prefix = `${context.athlete._id}/exports/${id}/`;
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({
          Bucket: process.env.R2_BUCKET,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      if (page.Contents?.length) {
        const result = await s3.send(
          new DeleteObjectsCommand({
            Bucket: process.env.R2_BUCKET,
            Delete: { Objects: page.Contents.map((o) => ({ Key: o.Key! })) },
          }),
        );
        if (result.Errors?.length)
          throw new Error("Export cleanup incomplete.");
      }
      token = page.NextContinuationToken;
    } while (token);
    await removeObject(`${context.athlete._id}/exports/${id}.zip`);
    let keyMarker: string | undefined, uploadIdMarker: string | undefined;
    do {
      const page = await s3.send(
        new ListMultipartUploadsCommand({
          Bucket: process.env.R2_BUCKET,
          Prefix: prefix,
          KeyMarker: keyMarker,
          UploadIdMarker: uploadIdMarker,
        }),
      );
      for (const upload of page.Uploads ?? [])
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: process.env.R2_BUCKET,
            Key: upload.Key,
            UploadId: upload.UploadId,
          }),
        );
      keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
      uploadIdMarker = page.IsTruncated ? page.NextUploadIdMarker : undefined;
    } while (keyMarker);
    await ctx.runMutation(internal.lifecycle.status, { id, status: "expired" });
  },
});
