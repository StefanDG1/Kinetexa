/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
describe("athlete ownership and consent", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("paginates the complete history and aggregates every page without crossing owners", async () => {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "paged" }),
      b = t.withIdentity({ subject: "separate" });
    const athleteId = await a.mutation(internal.athletes.ensureRecord);
    await b.mutation(internal.athletes.ensureRecord);
    await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "fixture.fit",
        key: "fixture",
        bytes: 1,
        status: "complete",
        attempts: 1,
        createdAt: 0,
      });
      for (let i = 0; i < 205; i++)
        await ctx.db.insert("activities", {
          athleteId,
          title: "Synthetic",
          sport: "running",
          start: i + 1,
          duration: 60,
          distance: 1000,
          summary: {},
          metrics: { metrics: { load: { value: null } } },
          route: Array.from({ length: 1201 }, (_, j) => [j / 1000, 0]),
          streamKey: "fixture",
          sourceId,
          notes: "",
          tags: [],
          gearIds: [],
          excludedRecords: false,
          version: "test",
          createdAt: 0,
        });
    });
    const first = await a.query(api.activities.page, {
      paginationOpts: { numItems: 1000, cursor: null },
    });
    expect(first.page).toHaveLength(100);
    expect(first.page[0].route.length).toBeLessThanOrEqual(121);
    expect(first.isDone).toBe(false);
    expect(
      (
        await b.query(api.activities.page, {
          paginationOpts: { numItems: 100, cursor: null },
        })
      ).page,
    ).toEqual([]);
    const result = await a.action(api.queryActions.preview, {
      query: {
        filters: [],
        metric: "distance",
        aggregate: "sum",
        group: "sport",
        visual: "bar",
      },
    });
    expect(result[0].value).toBe(205000);
  });
  it("starts private and prevents one athlete from reading or retrying another upload", async () => {
    const t = convexTest(schema, modules),
      alice = t.withIdentity({
        subject: "alice",
        issuer: "https://example.test",
      }),
      bob = t.withIdentity({ subject: "bob", issuer: "https://example.test" });
    await alice.mutation(internal.athletes.ensureRecord);
    await bob.mutation(internal.athletes.ensureRecord);
    const profile = await alice.query(api.athletes.current);
    expect(profile?.aiConsent).toBe(false);
    expect(profile?.analyticsConsent).toBe(false);
    const id = await alice.mutation(api.imports.reserve, {
      name: "run.fit",
      bytes: 100,
      nonce: "12345678-1234-1234-1234-123456789abc",
    });
    expect(await bob.query(api.imports.list)).toEqual([]);
    await expect(bob.query(api.imports.owned, { id })).rejects.toThrow(
      "unavailable",
    );
    await expect(bob.mutation(api.imports.enqueue, { id })).rejects.toThrow(
      "unavailable",
    );
    await expect(t.query(api.imports.list)).rejects.toThrow("Sign in");
  });
  it("authorizes writes and validates query syntax independently of the UI", async () => {
    const t = convexTest(schema, modules),
      alice = t.withIdentity({ subject: "alice" }),
      bob = t.withIdentity({ subject: "bob" });
    await alice.mutation(internal.athletes.ensureRecord);
    await bob.mutation(internal.athletes.ensureRecord);
    const id = await alice.mutation(api.workspace.saveGear, {
      name: "Road bike",
      kind: "bicycle",
      retired: false,
      servicedAt: 0,
    });
    await expect(
      bob.mutation(api.workspace.saveGear, {
        id,
        name: "Stolen",
        kind: "bicycle",
        retired: false,
        servicedAt: 0,
      }),
    ).rejects.toThrow("unavailable");
    await expect(
      alice.mutation(api.workspace.preview, { query: { code: "process.env" } }),
    ).rejects.toThrow();
  });
  it("enforces upload quotas atomically at the backend", async () => {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "limited" });
    await a.mutation(internal.athletes.ensureRecord);
    const args = {
      name: "x.gpx",
      bytes: 100,
      nonce: "12345678-1234-1234-1234-123456789abc",
    };
    for (let i = 0; i < 100; i++) await a.mutation(api.imports.reserve, args);
    await expect(a.mutation(api.imports.reserve, args)).rejects.toThrow(
      "Usage limit",
    );
  });
});
