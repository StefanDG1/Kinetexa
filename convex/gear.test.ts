/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");

it("tracks maintenance across paginated history, services, merges and retirement without crossing owners", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "gear-owner" }),
      b = t.withIdentity({ subject: "gear-other" });
    const athleteId = await a.mutation(internal.athletes.ensureRecord);
    await b.mutation(internal.athletes.ensureRecord);
    const input = {
      name: "Road bicycle",
      kind: "bicycle",
      retired: false,
      servicedAt: 0,
    };
    const gearId = await a.mutation(api.workspace.saveGear, input);
    const setting = {
      gearId,
      title: "Chain service",
      distanceKm: 100,
      disabled: false,
    };
    const id = await a.mutation(api.gear.saveReminder, setting);
    await expect(b.mutation(api.gear.saveReminder, setting)).rejects.toThrow(
      "unavailable",
    );
    await expect(
      b.mutation(api.gear.completeService, { id, at: 1, note: "" }),
    ).rejects.toThrow("unavailable");
    await expect(
      a.mutation(api.gear.saveReminder, { ...setting, durationHours: -1 }),
    ).rejects.toThrow();
    const ids = await t.run(async (ctx) => {
      const sourceId = await ctx.db.insert("sources", {
        athleteId,
        name: "ride.fit",
        key: "private",
        bytes: 1,
        status: "complete",
        attempts: 1,
        createdAt: 0,
      });
      const result = [];
      for (let i = 1; i <= 105; i++)
        result.push(
          await ctx.db.insert("activities", {
            athleteId,
            sourceId,
            title: "Ride",
            sport: "cycling",
            start: i,
            duration: 3600,
            distance: 1000,
            summary: {},
            metrics: {},
            route: [],
            streamKey: "private",
            notes: "",
            tags: [],
            gearIds: [gearId, gearId],
            excludedRecords: false,
            version: "test",
            createdAt: 0,
          }),
        );
      return result;
    });
    let result = await a.action(api.gear.status);
    expect(result.gear[0].usage).toMatchObject({
      distanceKm: 105,
      durationHours: 105,
      activityCount: 105,
    });
    expect(result.reminders[0].due).toBe(true);
    expect((await b.action(api.gear.status)).gear).toEqual([]);
    await a.mutation(api.activities.merge, { id: ids[0], into: ids[1] });
    expect((await a.action(api.gear.status)).gear[0].usage.activityCount).toBe(
      104,
    );
    const service = { id, at: 102, note: "Cleaned and lubricated" };
    const event = await a.mutation(api.gear.completeService, service);
    expect(await a.mutation(api.gear.completeService, service)).toBe(event);
    result = await a.action(api.gear.status);
    expect(result.reminders[0].usage.distanceKm).toBe(3);
    expect(result.reminders[0].due).toBe(false);
    expect(
      (
        await a.query(api.gear.history, {
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toHaveLength(1);
    await a.mutation(api.gear.saveReminder, {
      ...setting,
      id,
      distanceKm: undefined,
      dueAt: 1,
    });
    expect((await a.action(api.gear.status)).reminders[0].due).toBe(true);
    await a.mutation(api.workspace.saveGear, {
      ...input,
      id: gearId,
      retired: true,
    });
    result = await a.action(api.gear.status);
    expect(result.reminders[0].due).toBe(false);
    expect(result.gear[0].usage.activityCount).toBe(104);
    await a.mutation(api.gear.completeService, {
      id,
      at: 103,
      note: "Inspected",
    });
    expect((await a.query(api.gear.reminders))[0]).toMatchObject({
      disabled: true,
    });
    expect(
      (
        await t.query(internal.lifecycle.page, {
          athleteId,
          table: "gearReminders",
          cursor: null,
        })
      ).page,
    ).toHaveLength(1);
    expect(
      (
        await t.query(internal.lifecycle.page, {
          athleteId,
          table: "gearServices",
          cursor: null,
        })
      ).page,
    ).toHaveLength(2);
    await a.mutation(api.lifecycle.requestDeletion, {
      confirmation: "DELETE MY ACCOUNT",
    });
    await expect(a.action(api.gear.status)).rejects.toThrow();
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
