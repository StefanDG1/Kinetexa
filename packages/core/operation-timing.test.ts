import { expect, it, vi } from "vitest";
import { operationTiming } from "./operation-timing";

it("records bounded phase timings without swallowing failures or their results", async () => {
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValueOnce(100)
    .mockReturnValueOnce(120);
  try {
    const timing = operationTiming();
    expect(timing.sync("analytics", () => 42)).toBe(42);
    expect(timing.phases[0]).toEqual({
      name: "analytics",
      startedAt: 100,
      endedAt: 120,
      failed: false,
    });
    await expect(
      timing.measure("storage.read", async () => {
        throw new Error("private-key");
      }),
    ).rejects.toThrow("private-key");
    expect(timing.phases[1].failed).toBe(true);
    expect(JSON.stringify(timing.phases)).not.toContain("private-key");
    for (let i = 0; i < 40; i++) timing.sync("analytics", () => 0);
    expect(timing.phases).toHaveLength(32);
  } finally {
    clock.mockRestore();
  }
});
