/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("recovers a partial archive when its failed child is retried without losing successful children", async () => {
  vi.useFakeTimers();
  vi.stubEnv("KINETEXA_ENVIRONMENT", "staging");
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "archive-owner" }),
      b = t.withIdentity({ subject: "archive-other" });
    const athleteId = await a.mutation(api.athletes.ensure, {});
    await b.mutation(api.athletes.ensure, {});
    const { parent, child } = await t.run(async (ctx) => {
      const parent = await ctx.db.insert("sources", {
        athleteId,
        name: "migration.zip",
        key: `${athleteId}/originals/archive`,
        bytes: 1,
        status: "processing-archive",
        attempts: 1,
        createdAt: 0,
      });
      const children = [];
      for (let i = 0; i < 151; i++)
        children.push(
          await ctx.db.insert("sources", {
            athleteId,
            parentId: parent,
            name: `activity-${i}.fit`,
            key: `${athleteId}/originals/${i}`,
            bytes: 1,
            status: i === 150 ? "failed" : "complete",
            attempts: 1,
            createdAt: i,
            hash: i.toString(16).padStart(64, "0"),
          }),
        );
      await ctx.db.patch(parent, { childIds: children });
      return { parent, child: children[150] };
    });
    const settle = async () => {
      for (let i = 0; i < 10; i++) {
        await t.mutation(internal.imports.archiveProgress, { id: parent });
        const s = await a.query(api.imports.owned, { id: parent });
        if (s.status !== "processing-archive") return s;
      }
      throw Error("Archive did not settle");
    };
    expect(await settle()).toMatchObject({
      status: "partial",
      completedChildren: 150,
      failedChildren: 1,
    });
    await expect(
      b.mutation(api.imports.enqueue, { id: child }),
    ).rejects.toThrow("unavailable");
    await a.mutation(api.imports.enqueue, { id: child });
    expect((await a.query(api.imports.owned, { id: parent })).status).toBe(
      "processing-archive",
    );
    await t.run((ctx) => ctx.db.patch(child, { status: "complete" }));
    expect(await settle()).toMatchObject({
      status: "complete",
      completedChildren: 151,
      failedChildren: 0,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(parent, { status: "partial" });
      await ctx.db.patch(child, { status: "failed" });
    });
    await a.mutation(api.imports.enqueue, { id: parent });
    expect((await a.query(api.imports.owned, { id: parent })).status).toBe(
      "queued",
    );
    await t.mutation(internal.imports.claim, { id: parent });
    const failed = await a.query(api.imports.owned, { id: child });
    expect(
      await t.mutation(internal.imports.child, {
        parentId: parent,
        name: failed.name,
        key: failed.key,
        bytes: failed.bytes,
        hash: failed.hash!,
        attempt: 2,
      }),
    ).toBe(child);
    expect((await a.query(api.imports.owned, { id: child })).status).toBe(
      "queued",
    );
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  }
});
