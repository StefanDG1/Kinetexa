/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("verifies first registration with WorkOS and returns the same account without repeat allocation", async () => {
  const t = convexTest(schema, modules),
    owner = t.withIdentity({
      subject: "user_verified",
      sid: "session_verified",
    });
  const request = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "user_verified" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", request);
  vi.stubEnv("WORKOS_API_KEY", "unit-fixture");
  try {
    const id = await owner.action(api.athletes.ensure, {});
    expect(await owner.action(api.athletes.ensure, {})).toBe(id);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(
      "https://api.workos.com/user_management/users/user_verified",
    );
    expect(
      await t.run((ctx) => ctx.db.query("athletes").collect()),
    ).toHaveLength(1);
    await owner.mutation(internal.sessions.revoke, {});
    await expect(owner.action(api.athletes.ensure, {})).rejects.toThrow(
      "Sign in",
    );
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
it("does not allocate an athlete for a deleted, unavailable or mismatched provider identity", async () => {
  for (const [status, body] of [
    [404, null],
    [503, null],
    [200, { id: "different_user" }],
  ] as const) {
    const t = convexTest(schema, modules),
      owner = t.withIdentity({
        subject: "user_missing",
        sid: "session_missing",
      });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(body ? JSON.stringify(body) : null, { status }),
        ),
    );
    vi.stubEnv("WORKOS_API_KEY", "unit-fixture");
    try {
      await expect(owner.action(api.athletes.ensure, {})).rejects.toThrow(
        "unavailable",
      );
      expect(
        await t.run((ctx) => ctx.db.query("athletes").collect()),
      ).toHaveLength(0);
      await expect(t.action(api.athletes.ensure, {})).rejects.toThrow(
        "Sign in",
      );
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  }
});
