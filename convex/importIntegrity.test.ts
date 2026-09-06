/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("seals the original under an immutable checksum identity and fences stale attempts and temporary cleanup", async () => {
  vi.useFakeTimers();
  vi.stubEnv("KINETEXA_ENVIRONMENT", "staging");
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "integrity-owner" });
    const athleteId = await a.mutation(internal.athletes.ensureRecord, {});
    const id = await a.mutation(api.imports.reserve, {
      name: "synthetic.gpx",
      bytes: 100,
      nonce: "12345678-1234-1234-1234-123456789abc",
    });
    const source = await a.query(api.imports.owned, { id });
    expect(source.key).toContain("/uploads/");
    await t.run((ctx) => ctx.db.patch(id, { status: "queued" }));
    await t.mutation(internal.imports.claim, { id });
    const args = {
      id,
      hash: "a".repeat(64),
      key: `${athleteId}/originals/${"a".repeat(64)}`,
      expectedKey: source.key,
      attempt: 1,
    };
    expect(
      await t.mutation(internal.imports.received, { ...args, attempt: 0 }),
    ).toBe(false);
    expect(await t.mutation(internal.imports.received, args)).toBe(true);
    const sealed = await a.query(api.imports.owned, { id });
    expect(sealed.key).toBe(args.key);
    expect(sealed.hash).toBe(args.hash);
    expect(await t.query(internal.imports.uploadCleanup, { id })).toBeNull();
    await expect(
      t.mutation(internal.imports.received, {
        ...args,
        expectedKey: args.key,
        hash: "b".repeat(64),
        key: `${athleteId}/originals/${"b".repeat(64)}`,
      }),
    ).rejects.toThrow("integrity");
    vi.setSystemTime(Date.now() + 12 * 60000);
    expect(await t.query(internal.imports.uploadCleanup, { id })).toBe(
      source.key,
    );
    await t.mutation(internal.imports.uploadRemoved, { id, key: args.key });
    expect((await a.query(api.imports.owned, { id })).uploadKey).toBe(
      source.key,
    );
    await t.mutation(internal.imports.uploadRemoved, { id, key: source.key });
    expect(await t.query(internal.imports.uploadCleanup, { id })).toBeNull();
    expect((await a.query(api.imports.owned, { id })).key).toBe(args.key);
    await t.run((ctx) => ctx.db.patch(id, { status: "running", attempts: 2 }));
    await t.mutation(internal.imports.failed, {
      id,
      attempt: 1,
      message: "Late failure",
      retryable: false,
    });
    await t.mutation(internal.imports.healthComplete, {
      id,
      hash: args.hash,
      attempt: 1,
    });
    expect((await a.query(api.imports.owned, { id })).status).toBe("running");
    await t.mutation(internal.imports.healthComplete, {
      id,
      hash: args.hash,
      attempt: 2,
    });
    await t.mutation(internal.imports.failed, {
      id,
      attempt: 2,
      message: "Lost completion response",
      retryable: true,
    });
    expect((await a.query(api.imports.owned, { id })).status).toBe("complete");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});
