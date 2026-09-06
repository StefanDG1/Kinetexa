import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { Unzip, UnzipInflate } from "fflate";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export const RETENTION_MS = 7 * 86400000;
export function readConfig() {
  const config = JSON.parse(process.env.BACKUP_CONFIG || "null");
  if (
    !config ||
    !["staging", "production"].includes(config.environment) ||
    !config.convexDeploymentKey ||
    !config.convexUrl
  )
    throw new Error("Private backup configuration is incomplete.");
  for (const kind of ["source", "target"])
    for (const key of ["endpoint", "bucket", "accessKeyId", "secretAccessKey"])
      if (typeof config[kind]?.[key] !== "string" || !config[kind][key])
        throw new Error("Private storage configuration is incomplete.");
  if (config.source.bucket === config.target.bucket)
    throw new Error("Backups require a separate bucket.");
  return config;
}
export const storageClient = (config) =>
  new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
export async function listObjects(client, bucket, prefix) {
  const objects = [];
  let token;
  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    objects.push(...(result.Contents ?? []));
    token = result.NextContinuationToken;
  } while (token);
  return objects;
}
export async function jsonObject(client, bucket, key) {
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    return JSON.parse(await result.Body.transformToString());
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}
// Stream each JSONL table; no complete table or uncompressed snapshot is held in memory.
export async function scanSnapshot(filename, onRecord) {
  let failure;
  const unzip = new Unzip((file) => {
    if (!file.name.endsWith("/documents.jsonl")) return;
    const table = file.name.split("/").at(-2),
      decoder = new TextDecoder();
    let pending = "";
    file.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      try {
        pending += decoder.decode(data, { stream: !final });
        let newline;
        while ((newline = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          if (line.trim()) onRecord(table, JSON.parse(line));
        }
        if (final && pending.trim()) {
          onRecord(table, JSON.parse(pending));
          pending = "";
        }
      } catch (e) {
        failure = e;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for await (const chunk of fs.createReadStream(filename)) {
    unzip.push(chunk);
    if (failure) throw failure;
  }
  unzip.push(new Uint8Array(), true);
  if (failure) throw failure;
}
async function hashFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function uploadFile(client, bucket, key, filename, sha256) {
  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(filename),
      Metadata: { sha256 },
    },
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
  }).done();
  const stored = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: key }),
  );
  if (
    stored.ContentLength !== fs.statSync(filename).size ||
    stored.Metadata?.sha256 !== sha256
  )
    throw new Error("Backup upload verification failed.");
}
async function exportDatabase(config, filename) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/convex/bin/main.js"),
        "export",
        "--path",
        filename,
      ],
      {
        cwd: root,
        env: { ...process.env, CONVEX_DEPLOY_KEY: config.convexDeploymentKey },
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      },
    );
    child.on("error", () =>
      reject(new Error("Database export could not start.")),
    );
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Database export failed. Inspect the private deployment dashboard.",
            ),
          ),
    );
  });
}
export async function prune(config, target) {
  const prefix = config.environment + "/",
    cutoff = Date.now() - RETENTION_MS;
  const manifests = await listObjects(
    target,
    config.target.bucket,
    prefix + "snapshots/",
  );
  const keep = new Set(),
    remove = [];
  for (const object of manifests) {
    if (!object.Key.endsWith("/manifest.json")) continue;
    const manifest = await jsonObject(target, config.target.bucket, object.Key);
    if (!manifest) continue;
    if (manifest.createdAt < cutoff) {
      remove.push(object.Key, manifest.database.key);
      continue;
    }
    keep.add(manifest.database.key);
    for (const source of manifest.objects) keep.add(source.backupKey);
  }
  for (const object of await listObjects(
    target,
    config.target.bucket,
    prefix + "objects/",
  ))
    if (
      !keep.has(object.Key) &&
      object.LastModified?.getTime() < Date.now() - 86400000
    )
      remove.push(object.Key);
  for (const object of manifests)
    if (
      object.Key.endsWith("/snapshot.zip") &&
      !keep.has(object.Key) &&
      object.LastModified?.getTime() < Date.now() - 86400000
    )
      remove.push(object.Key);
  const unique = [...new Set(remove)];
  for (let i = 0; i < unique.length; i += 1000) {
    const result = await target.send(
      new DeleteObjectsCommand({
        Bucket: config.target.bucket,
        Delete: { Objects: unique.slice(i, i + 1000).map((Key) => ({ Key })) },
      }),
    );
    if (result.Errors?.length)
      throw new Error("Backup retention cleanup failed.");
  }
  return unique.length;
}
export async function backup(config) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kinetexa-backup-"));
  try {
    const startedAt = Date.now(),
      id =
        new Date(startedAt).toISOString().replaceAll(":", "-") +
        "-" +
        randomUUID(),
      prefix = config.environment + "/",
      snapshot = path.join(directory, "snapshot.zip");
    const source = storageClient(config.source),
      target = storageClient(config.target);
    await exportDatabase(config, snapshot);
    const references = new Map(),
      counts = {};
    await scanSnapshot(snapshot, (table, row) => {
      counts[table] = (counts[table] ?? 0) + 1;
      if (table === "sources" && row.status !== "awaiting-upload")
        references.set(row.key, row.hash);
      if (["activities", "metricHistory"].includes(table) && row.streamKey)
        references.set(row.streamKey, undefined);
    });
    const latest = await jsonObject(
      target,
      config.target.bucket,
      prefix + "latest.json",
    );
    const prior = latest
      ? await jsonObject(target, config.target.bucket, latest.manifestKey)
      : null;
    const previous = new Map((prior?.objects ?? []).map((o) => [o.key, o])),
      objects = [];
    const deleted = new Set(
      (
        await listObjects(target, config.target.bucket, prefix + "tombstones/")
      ).map((o) =>
        o.Key.split("/")
          .at(-1)
          .replace(/\.json$/, ""),
      ),
    );
    let copied = 0;
    for (const [key, expectedHash] of references) {
      if (deleted.has(key.split("/")[0])) continue;
      const head = await source.send(
          new HeadObjectCommand({ Bucket: config.source.bucket, Key: key }),
        ),
        old = previous.get(key);
      if (old && old.etag === head.ETag && old.bytes === head.ContentLength) {
        const stored = await target.send(
          new HeadObjectCommand({
            Bucket: config.target.bucket,
            Key: old.backupKey,
          }),
        );
        if (
          stored.ContentLength !== old.bytes ||
          stored.Metadata?.sha256 !== old.sha256
        )
          throw new Error("Previous backup object failed verification.");
        objects.push(old);
        continue;
      }
      const filename = path.join(directory, "object.bin"),
        hash = createHash("sha256"),
        input = await source.send(
          new GetObjectCommand({ Bucket: config.source.bucket, Key: key }),
        );
      await pipeline(
        input.Body,
        new Transform({
          transform(chunk, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        fs.createWriteStream(filename),
      );
      const sha256 = hash.digest("hex");
      if (expectedHash && sha256 !== expectedHash)
        throw new Error("Retained original checksum mismatch.");
      const backupKey = prefix + "objects/" + sha256;
      await uploadFile(
        target,
        config.target.bucket,
        backupKey,
        filename,
        sha256,
      );
      objects.push({
        key,
        backupKey,
        sha256,
        bytes: fs.statSync(filename).size,
        etag: head.ETag,
      });
      copied++;
      fs.unlinkSync(filename);
    }
    const database = {
      key: prefix + "snapshots/" + id + "/snapshot.zip",
      sha256: await hashFile(snapshot),
      bytes: fs.statSync(snapshot).size,
    };
    await uploadFile(
      target,
      config.target.bucket,
      database.key,
      snapshot,
      database.sha256,
    );
    const manifestKey = prefix + "snapshots/" + id + "/manifest.json",
      manifest = {
        format: "kinetexa-backup-1",
        environment: config.environment,
        convexUrl: config.convexUrl,
        createdAt: startedAt,
        finishedAt: Date.now(),
        database,
        objects,
        tableCounts: counts,
        temporaryExports:
          "Not copied. Restore must expire export jobs and discard export parts.",
      };
    await target.send(
      new PutObjectCommand({
        Bucket: config.target.bucket,
        Key: manifestKey,
        Body: JSON.stringify(manifest),
        ContentType: "application/json",
      }),
    );
    await target.send(
      new PutObjectCommand({
        Bucket: config.target.bucket,
        Key: prefix + "latest.json",
        Body: JSON.stringify({ manifestKey, finishedAt: manifest.finishedAt }),
        ContentType: "application/json",
      }),
    );
    const removed = await prune(config, target);
    return {
      event: "backup_completed",
      environment: config.environment,
      manifestKey,
      objects: objects.length,
      copied,
      documents: Object.values(counts).reduce((a, b) => a + b, 0),
      durationMs: Date.now() - startedAt,
      expiredObjectsRemoved: removed,
    };
  } finally {
    // mkdtemp supplies this exact workspace; never remove a caller-provided path.
    const resolved = path.resolve(directory),
      temporaryRoot = path.resolve(os.tmpdir());
    if (
      path.dirname(resolved) !== temporaryRoot ||
      !path.basename(resolved).startsWith("kinetexa-backup-")
    )
      throw new Error("Unexpected temporary backup path.");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const config = readConfig();
    console.log(
      JSON.stringify(
        process.argv.includes("--prune-only")
          ? {
              event: "backup_retention_completed",
              removed: await prune(config, storageClient(config.target)),
            }
          : await backup(config),
      ),
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "backup_failed",
        message:
          "Backup failed; credentials and private records are excluded from logs.",
      }),
    );
    process.exitCode = 1;
  }
}
