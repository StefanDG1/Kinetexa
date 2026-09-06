/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
const storage = vi.hoisted(() => ({
  objects: new Map<string, Uint8Array>(),
  delayReads: false,
}));
vi.mock("./storage", () => ({
  client: () => ({
    send: async (command: any) => {
      const name = command.constructor.name,
        input = command.input;
      if (name === "GetObjectCommand") {
        const data = storage.objects.get(input.Key);
        if (!data) throw Error("Object unavailable");
        return {
          Body: {
            async *[Symbol.asyncIterator]() {
              if (storage.delayReads) vi.setSystemTime(Date.now() + 31000);
              yield data;
            },
          },
        };
      }
      if (name === "ListObjectsV2Command")
        return {
          Contents: [...storage.objects.keys()]
            .filter((k) => k.startsWith(input.Prefix))
            .map((Key) => ({ Key })),
        };
      if (name === "DeleteObjectsCommand") {
        for (const obj of input.Delete.Objects) storage.objects.delete(obj.Key);
        return {};
      }
      if (name === "ListMultipartUploadsCommand") return {};
      throw Error("Unexpected storage operation");
    },
  }),
  putObject: async (key: string, data: Uint8Array) => {
    storage.objects.set(key, data);
  },
  removeObject: async (key: string) => {
    storage.objects.delete(key);
  },
  downloadUrl: async (key: string) => `https://download.invalid/${key}`,
}));
vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    params: any;
    constructor(options: any) {
      this.params = options.params;
    }
    async done() {
      const parts: Uint8Array[] = [];
      for await (const part of this.params.Body) parts.push(part);
      storage.objects.set(this.params.Key, Buffer.concat(parts));
      return {};
    }
    async abort() {}
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
  storage.objects.clear();
  storage.delayReads = false;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function setup() {
  const t = convexTest(schema, modules),
    a = t.withIdentity({ subject: "export-owner" }),
    b = t.withIdentity({ subject: "export-other" });
  const athleteId = await a.mutation(api.athletes.ensure);
  await b.mutation(api.athletes.ensure);
  const id = await a.mutation(api.lifecycle.requestExport, {});
  return { t, a, b, athleteId, id };
}
it("resumes completed parts, fences stale workers and blocks retries and publication after deletion", async () => {
  const { t, a, b, athleteId, id } = await setup();
  const first = (await t.mutation(internal.exports.claim, { id }))!;
  const part = {
    id,
    lease: first.job.lease,
    key: "part-one",
    bytes: 12,
    sha256: "synthetic",
    position: { table: 1, cursor: null, page: 0 },
    done: false,
  };
  expect(await t.mutation(internal.exports.checkpoint, part)).toBe(true);
  expect(await t.mutation(internal.exports.checkpoint, part)).toBe(false);
  const next = (await t.mutation(internal.exports.claim, { id }))!;
  expect(next.job.position?.table).toBe(1);
  await t.mutation(internal.exports.fail, { id, lease: first.job.lease });
  expect((await a.query(api.lifecycle.owned, { id })).status).toBe("running");
  for (let i = 0; i < 4; i++) {
    const job = await a.query(api.lifecycle.owned, { id });
    await t.mutation(internal.exports.fail, { id, lease: job.lease! });
    if (i < 3) await t.mutation(internal.exports.claim, { id });
  }
  expect((await a.query(api.lifecycle.owned, { id })).status).toBe("failed");
  await expect(b.mutation(api.exports.retry, { id })).rejects.toThrow(
    "unavailable",
  );
  await a.mutation(api.exports.retry, { id });
  const retry = (await t.mutation(internal.exports.claim, { id }))!;
  expect(retry.job.partCount).toBe(1);
  await t.run((ctx) => ctx.db.patch(athleteId, { status: "deleting" }));
  expect(
    await t.mutation(internal.exports.checkpoint, {
      ...part,
      lease: retry.job.lease,
    }),
  ).toBe(false);
  await expect(
    b.action(api.exportActions.downloadPart, { id, index: 0 }),
  ).rejects.toThrow("unavailable");
});
it("builds resumable ZIP parts containing every original, canonical revision and private table, with verified checksums", async () => {
  const { t, a, b, athleteId, id } = await setup();
  await t.run(async (ctx) => {
    for (let i = 0; i < 6; i++) {
      const bytes = Buffer.from(`original-${i}`),
        key = `${athleteId}/original-${i}`,
        streamKey = `${athleteId}/stream-${i}`;
      storage.objects.set(key, bytes);
      storage.objects.set(
        streamKey,
        Buffer.from(JSON.stringify({ sample: i })),
      );
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: `fixture-${i}.fit`,
        key,
        hash: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length,
        status: "complete",
        attempts: 1,
        createdAt: Date.now(),
      });
      const activityId = await ctx.db.insert("activities", {
        athleteId,
        sourceId,
        streamKey,
        title: `Activity ${i}`,
        sport: "running",
        start: i,
        duration: 60,
        distance: 100,
        summary: {},
        metrics: {},
        route: [],
        notes: "",
        tags: [],
        gearIds: [],
        excludedRecords: false,
        version: "test",
        createdAt: Date.now(),
      });
      if (i === 0) {
        storage.objects.set("prior-stream", Buffer.from('{"prior":true}'));
        await ctx.db.insert("metricHistory", {
          athleteId,
          activityId,
          streamKey: "prior-stream",
          metrics: {},
          at: 0,
        });
      }
    }
  });
  storage.delayReads = true;
  for (let i = 0; i < 20; i++) {
    const job = await a.query(api.lifecycle.owned, { id });
    if (job.status === "finalizing") {
      await t.action(internal.exportActions.finalize, { id });
      break;
    }
    await t.action(internal.exportActions.run, { id });
  }
  const job = await a.query(api.lifecycle.owned, { id });
  expect(job.status).toBe("complete");
  expect(job.partCount).toBeGreaterThan(1);
  const parts = (await a.query(api.exports.list, { id, cursor: null })).page;
  const files: Record<string, Uint8Array> = {};
  for (const part of parts) {
    const bytes = storage.objects.get(part.key)!;
    expect(bytes.length).toBe(part.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(part.sha256);
    Object.assign(files, unzipSync(bytes));
  }
  expect(
    Object.keys(files).filter((n) => n.startsWith("originals/")),
  ).toHaveLength(6);
  expect(
    Object.keys(files).filter((n) => n.startsWith("canonical/")),
  ).toHaveLength(6);
  expect(
    Object.keys(files).filter((n) => n.startsWith("canonical-history/")),
  ).toHaveLength(1);
  expect(files["data/aiRuns-0.json"]).toBeDefined();
  expect(files["data/insights-0.json"]).toBeDefined();
  expect(strFromU8(files["profile.json"])).not.toContain("workosUserId");
  await expect(b.query(api.exports.list, { id, cursor: null })).rejects.toThrow(
    "unavailable",
  );
  expect(
    await a.action(api.exportActions.downloadPart, { id, index: 0 }),
  ).toContain("download.invalid");
  vi.setSystemTime(job.createdAt + 8 * 86400000);
  await expect(
    a.action(api.exportActions.downloadPart, { id, index: 0 }),
  ).rejects.toThrow("expired");
  await t.mutation(internal.exports.expirePage, {});
  await t.action(internal.exportActions.cleanup, { id });
  expect(
    [...storage.objects.keys()].some((k) => k.includes(`/exports/${id}/`)),
  ).toBe(false);
  expect(storage.objects.has("prior-stream")).toBe(true);
});
