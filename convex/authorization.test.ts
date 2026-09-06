/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, it, expect } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
describe("athlete ownership and consent", () => {
  it("starts private and prevents one athlete from reading or retrying another upload", async () => {
    const t = convexTest(schema, modules),
      alice = t.withIdentity({
        subject: "alice",
        issuer: "https://example.test",
      }),
      bob = t.withIdentity({ subject: "bob", issuer: "https://example.test" });
    await alice.mutation(api.athletes.ensure);
    await bob.mutation(api.athletes.ensure);
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
    await alice.mutation(api.athletes.ensure);
    await bob.mutation(api.athletes.ensure);
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
    await a.mutation(api.athletes.ensure);
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
