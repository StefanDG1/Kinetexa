/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import { anyApi } from "convex/server";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
it("enforces provider gates server-side, reports capability uncertainty and rejects anonymous access", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "provider-owner" });
    await a.mutation(anyApi.athletes.ensure, {});
    const catalog = await a.query(anyApi.providers.catalog, {});
    expect(catalog.fileImport.formats).toEqual(["fit", "tcx", "gpx", "zip"]);
    expect(catalog.persistentConnectionAvailable).toBe(false);
    for (const provider of catalog.providers) {
      expect(provider.externalAi).toBe("blocked");
      expect(
        Object.values(provider.capabilities).every(
          (c: any) => c.state === "unverified",
        ),
      ).toBe(true);
      await expect(
        a.mutation(anyApi.providers.connect, { provider: provider.id }),
      ).rejects.toThrow(provider.reason);
    }
    await expect(t.query(anyApi.providers.catalog, {})).rejects.toThrow(
      "Sign in",
    );
    await expect(
      t.mutation(anyApi.providers.connect, { provider: "garmin" }),
    ).rejects.toThrow("Sign in");
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
});
