/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { duplicateAssessment } from "../packages/core/dedup";
const modules = import.meta.glob("./**/*.ts");

it("explains duplicate boundaries without inventing missing distance or a probability", () => {
  const a = {
    sport: "running" as const,
    start: 0,
    duration: 1000,
    distance: 5000,
  };
  expect(duplicateAssessment(a, { ...a, start: 60000 }).score).toBe(0.95);
  expect(duplicateAssessment(a, { ...a, start: 60001 }).score).toBe(0);
  expect(duplicateAssessment(a, { ...a, sport: "cycling" }).score).toBe(0);
  const missing = duplicateAssessment(a, { ...a, distance: undefined });
  expect(missing.score).toBe(0.7);
  expect(missing.inputs.distanceDifferenceRatio).toBeNull();
  expect(duplicateAssessment(a, { ...a, duration: 900 }).score).toBe(0);
});

it("preserves sources, edits and history through exact deduplication, keep-separate, merge and undo", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      owner = t.withIdentity({ subject: "duplicates-owner" }),
      other = t.withIdentity({ subject: "duplicates-other" });
    const athleteId = await owner.mutation(internal.athletes.ensureRecord);
    const otherId = await other.mutation(internal.athletes.ensureRecord);
    const add = async (
      hash: string,
      start: number,
      duration: number,
      distance?: number,
      ownerId = athleteId,
    ) => {
      const id = await t.run((ctx) =>
        ctx.db.insert("sources", {
          athleteId: ownerId,
          name: `${hash}.fit`,
          key: `original-${hash}`,
          bytes: 20,
          attempts: 1,
          status: "running",
          createdAt: 0,
        }),
      );
      await t.mutation(internal.imports.complete, {
        id,
        hash,
        summary: {
          title: hash,
          sport: "running",
          start,
          duration,
          distance,
          laps: [],
        },
        metrics: {},
        route: [],
        streamKey: `stream-${hash}`,
        attempt: 1,
      });
      return (await t.run((ctx) => ctx.db.get(id)))!;
    };
    const weak = await add("weak", 0, 950);
    const target = await add("target", 10000, 1000, 5000);
    const candidate = await add("candidate", 20000, 1000, 5000);
    const targetId = target.activityId!,
      candidateId = candidate.activityId!;
    const foreign = await add("foreign", 20000, 1000, 5000, otherId);
    expect(
      (await owner.query(api.activities.get, { id: candidateId })).duplicateOf,
    ).toBe(targetId);
    expect(
      await owner.query(api.activities.duplicate, { id: candidateId }),
    ).toMatchObject({
      status: "suggested",
      target: { id: targetId },
      assessment: { score: 0.95, inputs: { startDifferenceSeconds: 10 } },
    });
    await owner.mutation(api.activities.keepSeparate, { id: candidateId });
    expect(
      (await owner.query(api.activities.duplicate, { id: candidateId }))
        ?.status,
    ).toBe("kept-separate");
    expect(await owner.query(api.activities.list, {})).toHaveLength(3);
    await owner.mutation(api.activities.update, {
      id: candidateId,
      title: "My recording",
      notes: "Retain my note",
      tags: ["training"],
      gearIds: [],
      excludedRecords: false,
    });
    await t.run((ctx) =>
      ctx.db.insert("metricHistory", {
        athleteId,
        activityId: candidateId,
        version: "old",
        metrics: {},
        at: 0,
      }),
    );
    const before = await owner.query(api.activities.get, { id: candidateId });
    const exact = await add("candidate", 20000, 1000, 5000);
    expect(exact.status).toBe("duplicate");
    expect(exact.activityId).toBe(candidateId);
    await owner.mutation(api.activities.merge, {
      id: candidateId,
      into: targetId,
    });
    expect(await owner.query(api.activities.list, {})).toHaveLength(2);
    expect(
      (await owner.query(api.activities.duplicate, { id: candidateId }))
        ?.status,
    ).toBe("merged");
    await expect(
      owner.mutation(api.activities.keepSeparate, { id: candidateId }),
    ).rejects.toThrow("Undo");
    await expect(
      owner.mutation(api.activities.merge, { id: targetId, into: candidateId }),
    ).rejects.toThrow();
    await expect(
      owner.mutation(api.activities.merge, {
        id: targetId,
        into: weak.activityId!,
      }),
    ).rejects.toThrow("Unmerge");
    await expect(
      owner.mutation(api.activities.merge, {
        id: candidateId,
        into: foreign.activityId!,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      other.query(api.activities.duplicate, { id: candidateId }),
    ).rejects.toThrow("unavailable");
    await expect(
      other.mutation(api.activities.keepSeparate, { id: candidateId }),
    ).rejects.toThrow("unavailable");
    await expect(
      other.query(api.activities.mergeMembersPage, {
        id: targetId,
        paginationOpts: { numItems: 1, cursor: null },
      }),
    ).rejects.toThrow("unavailable");
    const members = await owner.query(api.activities.mergeMembersPage, {
      id: targetId,
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(members.page.map((m) => m.id)).toEqual([candidateId]);
    const provenance = await owner.query(api.activities.provenance, {
      id: members.page[0].id,
    });
    expect(provenance.sources).toHaveLength(2);
    expect(provenance.sources.every((s) => s.hash === "candidate")).toBe(true);
    expect(provenance.history[0].version).toBe("old");
    const fact = (id: Id<"activities">) =>
      t.run((ctx) =>
        ctx.db
          .query("activityFacts")
          .withIndex("by_activity", (q) => q.eq("activityId", id))
          .unique(),
      );
    expect(await fact(candidateId)).toBeNull();
    await owner.mutation(api.activities.merge, { id: candidateId });
    expect(await fact(candidateId)).not.toBeNull();
    const after = await owner.query(api.activities.get, { id: candidateId });
    for (const key of [
      "title",
      "notes",
      "tags",
      "streamKey",
      "metrics",
      "summary",
      "sourceId",
    ] as const)
      expect(after[key]).toEqual(before[key]);
    expect(
      (await owner.query(api.activities.duplicate, { id: candidateId }))
        ?.status,
    ).toBe("kept-separate");
    expect(await owner.query(api.activities.list, {})).toHaveLength(3);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
