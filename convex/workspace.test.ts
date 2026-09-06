/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("supports owned workspace updates and deletion, validates plan and goal data, and preserves other items", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "workspace-owner" }),
      b = t.withIdentity({ subject: "workspace-other" });
    await a.mutation(api.athletes.ensure);
    await b.mutation(api.athletes.ensure);
    const zone = { name: "Home", lat: 45, lon: 25, radius: 300 };
    const zoneId = await a.mutation(api.workspace.saveZone, zone);
    await expect(
      b.mutation(api.workspace.saveZone, { ...zone, id: zoneId, radius: 500 }),
    ).rejects.toThrow("unavailable");
    await a.mutation(api.workspace.saveZone, {
      ...zone,
      id: zoneId,
      radius: 500,
    });
    expect((await a.query(api.workspace.overview)).privacyZones[0].radius).toBe(
      500,
    );
    const plan = {
      title: "Workout",
      sport: "running",
      start: Date.now(),
      duration: 1200,
      description: "Easy",
    };
    const planId = await a.mutation(api.workspace.savePlan, plan);
    await a.mutation(api.workspace.savePlan, {
      ...plan,
      id: planId,
      intensity: "Easy",
    });
    await a.mutation(api.workspace.savePlan, { ...plan, id: planId });
    expect(
      (await a.query(api.workspace.overview)).plans[0].intensity,
    ).toBeUndefined();
    await expect(
      a.mutation(api.workspace.savePlan, { ...plan, start: Number.NaN }),
    ).rejects.toThrow();
    await expect(
      a.mutation(api.workspace.savePlan, { ...plan, sport: "arbitrary" }),
    ).rejects.toThrow();
    const goal = {
      title: "Race",
      kind: "raceTime",
      start: 1,
      end: Date.now(),
      target: 1200,
    };
    const goalId = await a.mutation(api.workspace.saveGoal, goal);
    await a.mutation(api.workspace.saveGoal, {
      ...goal,
      id: goalId,
      manualProgress: 1250,
    });
    await a.mutation(api.workspace.saveGoal, { ...goal, id: goalId });
    expect(
      (await a.query(api.workspace.overview)).goals[0].manualProgress,
    ).toBeUndefined();
    await expect(
      a.mutation(api.workspace.saveGoal, { ...goal, end: 1e20 }),
    ).rejects.toThrow("dates");
    await expect(
      a.mutation(api.workspace.saveGoal, { ...goal, manualProgress: 0 }),
    ).rejects.toThrow();
    for (const id of [zoneId, planId, goalId])
      await expect(b.mutation(api.workspace.remove, { id })).rejects.toThrow(
        "unavailable",
      );
    await a.mutation(api.workspace.remove, { id: planId });
    const after = await a.query(api.workspace.overview);
    expect(after.plans).toEqual([]);
    expect(after.goals).toHaveLength(1);
    expect(after.privacyZones).toHaveLength(1);
    await a.mutation(api.workspace.remove, { id: zoneId });
    expect((await a.query(api.workspace.overview)).privacyZones).toEqual([]);
    await expect(
      a.mutation(api.athletes.updateProfile, {
        displayName: "Runner",
        timezone: "UTC",
        units: "imperial",
        aiConsent: false,
        analyticsConsent: false,
      }),
    ).rejects.toThrow("metric");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
