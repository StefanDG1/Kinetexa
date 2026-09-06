import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { once } from "node:events";
import { Unzip, UnzipInflate, Zip, ZipPassThrough } from "fflate";
import { GetObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import {
  RETENTION_MS,
  readConfig,
  storageClient,
  listObjects,
  jsonObject,
  scanSnapshot,
} from "./backup.mjs";
import { restoreRecord } from "./restore-model.mjs";

export async function scrubSnapshot(input, output, deleted) {
  const destination = fs.createWriteStream(output);
  let failure;
  const finished = new Promise((resolve, reject) => {
    destination.on("finish", resolve);
    destination.on("error", reject);
  });
  finished.catch(() => {});
  const entries = new Set();
  const zip = new Zip((error, data, final) => {
    if (error) {
      failure = error;
      destination.destroy(error);
      return;
    }
    destination.write(data);
    if (final) destination.end();
  });
  const unzip = new Unzip((file) => {
    entries.add(file.name);
    const entry = new ZipPassThrough(file.name);
    zip.add(entry);
    const jsonl = file.name.endsWith("/documents.jsonl"),
      table = file.name.split("/").at(-2),
      decoder = new TextDecoder();
    let pending = "";
    file.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        return;
      }
      try {
        if (!jsonl) {
          entry.push(data, final);
          return;
        }
        pending += decoder.decode(data, { stream: !final });
        let newline;
        const emit = (line) => {
          if (!line.trim()) return;
          const row = restoreRecord(table, JSON.parse(line), deleted);
          if (row) entry.push(Buffer.from(JSON.stringify(row) + "\n"), false);
        };
        while ((newline = pending.indexOf("\n")) >= 0) {
          emit(pending.slice(0, newline));
          pending = pending.slice(newline + 1);
        }
        if (final) {
          emit(pending);
          entry.push(new Uint8Array(), true);
        }
      } catch (e) {
        failure = e;
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for await (const chunk of fs.createReadStream(input)) {
      unzip.push(chunk);
      if (failure) throw failure;
      if (destination.writableNeedDrain) await once(destination, "drain");
    }
    unzip.push(new Uint8Array(), true);
    if (failure) throw failure;
    // Older snapshots predate this rebuildable cache. An explicit empty table
    // also clears stale cache rows when restoring over a newer deployment.
    if (!entries.has("activityFacts/documents.jsonl")) {
      const empty = new ZipPassThrough("activityFacts/documents.jsonl");
      zip.add(empty);
      empty.push(new Uint8Array(), true);
    }
    zip.end();
    await finished;
  } catch (error) {
    zip.terminate();
    destination.destroy();
    throw error;
  }
}
async function downloadVerified(client, bucket, key, filename, expected) {
  const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    ),
    hash = createHash("sha256");
  await pipeline(
    response.Body,
    new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    }),
    fs.createWriteStream(filename),
  );
  if (hash.digest("hex") !== expected)
    throw new Error("Backup checksum verification failed.");
}
export async function prepareRestore(config, restore) {
  if (
    restore.environment !== "restore" ||
    !restore.bucket?.includes("restore") ||
    restore.bucket === config.source.bucket ||
    !restore.directory
  )
    throw new Error(
      "Use an explicitly isolated restore bucket and output directory.",
    );
  const directory = path.resolve(restore.directory);
  fs.mkdirSync(directory, { recursive: true });
  const source = storageClient(config.target),
    target = storageClient(restore);
  const latest = await jsonObject(
    source,
    config.target.bucket,
    config.environment + "/latest.json",
  );
  const manifestKey = restore.manifestKey ?? latest?.manifestKey;
  if (
    manifestKey &&
    (!manifestKey.startsWith(config.environment + "/snapshots/") ||
      !manifestKey.endsWith("/manifest.json"))
  )
    throw new Error("Choose a backup manifest from the source environment.");
  const manifest = manifestKey
    ? await jsonObject(source, config.target.bucket, manifestKey)
    : null;
  if (
    !manifest ||
    manifest.environment !== config.environment ||
    manifest.format !== "kinetexa-backup-1" ||
    Date.now() - manifest.createdAt > RETENTION_MS
  )
    throw new Error("No valid recent backup is available.");
  const tombstones = async () =>
    new Set(
      (
        await listObjects(
          source,
          config.target.bucket,
          config.environment + "/tombstones/",
        )
      ).map((o) =>
        o.Key.split("/")
          .at(-1)
          .replace(/\.json$/, ""),
      ),
    );
  const deleted = await tombstones(),
    original = path.join(directory, "snapshot-original.zip"),
    filtered = path.join(directory, "snapshot-restore.zip");
  await downloadVerified(
    source,
    config.target.bucket,
    manifest.database.key,
    original,
    manifest.database.sha256,
  );
  const existing = await listObjects(target, restore.bucket, "");
  if (existing.length && restore.replaceExisting !== true)
    throw new Error(
      "The isolated restore bucket is not empty. Explicit replacement is required.",
    );
  for (let i = 0; i < existing.length; i += 1000) {
    const result = await target.send(
      new DeleteObjectsCommand({
        Bucket: restore.bucket,
        Delete: {
          Objects: existing.slice(i, i + 1000).map((o) => ({ Key: o.Key })),
        },
      }),
    );
    if (result.Errors?.length)
      throw new Error("Restore bucket cleanup failed.");
  }
  await scanSnapshot(original, (table, row) => {
    if (table === "athletes" && row.status === "deleting") deleted.add(row._id);
  });
  await scrubSnapshot(original, filtered, deleted);
  let copied = 0;
  for (const object of manifest.objects) {
    if (deleted.has(object.key.split("/")[0])) continue;
    const filename = path.join(directory, "object.bin");
    await downloadVerified(
      source,
      config.target.bucket,
      object.backupKey,
      filename,
      object.sha256,
    );
    await new Upload({
      client: target,
      params: {
        Bucket: restore.bucket,
        Key: object.key,
        Body: fs.createReadStream(filename),
      },
      queueSize: 2,
    }).done();
    const check = await target.send(
        new GetObjectCommand({ Bucket: restore.bucket, Key: object.key }),
      ),
      hash = createHash("sha256");
    for await (const chunk of check.Body) hash.update(chunk);
    if (hash.digest("hex") !== object.sha256)
      throw new Error("Restored object checksum mismatch.");
    fs.unlinkSync(filename);
    copied++;
  }
  for (const id of await tombstones())
    if (!deleted.has(id))
      throw new Error(
        "Deletion ledger changed during recovery. Prepare the restore again before importing it.",
      );
  fs.writeFileSync(
    path.join(directory, "restore-report.json"),
    JSON.stringify({
      sourceEnvironment: config.environment,
      snapshotCreatedAt: manifest.createdAt,
      preparedAt: Date.now(),
      objectsVerified: copied,
      deletionsApplied: deleted.size,
      filteredSnapshot: filtered,
      requiresImport: true,
      requiresJobAndBillingReconciliation: true,
    }),
  );
  return {
    event: "restore_prepared",
    objectsVerified: copied,
    deletionsApplied: deleted.size,
    filteredSnapshot: filtered,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        await prepareRestore(
          readConfig(),
          JSON.parse(process.env.RESTORE_CONFIG || "null"),
        ),
      ),
    );
  } catch {
    console.error(
      JSON.stringify({
        event: "restore_failed",
        message:
          "Restore stopped before database import. Private configuration and records are excluded from logs.",
      }),
    );
    process.exitCode = 1;
  }
}
