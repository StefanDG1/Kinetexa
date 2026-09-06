/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
describe("destructive lifecycle boundaries", () => {
  afterEach(() => vi.useRealTimers());
  it("requires explicit confirmation, locks immediately and purges only the requesting owner", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "erase" }),
      b = t.withIdentity({ subject: "keep" });
    const aid = await a.mutation(api.athletes.ensure),
      bid = await b.mutation(api.athletes.ensure);
    const gear = await b.mutation(api.workspace.saveGear, {
      name: "Keep",
      kind: "running shoe",
      retired: false,
      servicedAt: 0,
    });
    await expect(
      a.mutation(api.lifecycle.requestDeletion, { confirmation: "yes" }),
    ).rejects.toThrow("Type DELETE");
    const id = await a.mutation(api.lifecycle.requestDeletion, {
      confirmation: "DELETE MY ACCOUNT",
    });
    await expect(a.query(api.activities.list, {})).rejects.toThrow(
      "unavailable",
    );
    await expect(a.mutation(api.athletes.ensure, {})).rejects.toThrow(
      "being deleted",
    );
    while (
      !(await t.mutation(internal.lifecycle.purgeBatch, {
        athleteId: aid,
        jobId: id,
      }))
    ) {}
    expect(await t.run((ctx) => ctx.db.get(aid))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(bid))).not.toBeNull();
    expect(
      (await b.query(api.workspace.overview)).gear.map((g) => g._id),
    ).toContain(gear);
  });
  it("recovers an interrupted import once and ignores stale watchdog attempts", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "import" });
    await a.mutation(api.athletes.ensure);
    const id = await a.mutation(api.imports.reserve, {
      name: "run.fit",
      bytes: 100,
      nonce: "12345678-1234-1234-1234-123456789abc",
    });
    await a.mutation(api.imports.enqueue, { id });
    await t.mutation(internal.imports.claim, { id });
    await t.mutation(internal.imports.watchdog, { id, attempt: 1 });
    expect((await a.query(api.imports.owned, { id })).status).toBe("retrying");
    await t.mutation(internal.imports.claim, { id });
    await t.mutation(internal.imports.watchdog, { id, attempt: 1 });
    expect((await a.query(api.imports.owned, { id })).status).toBe("running");
  });
});
