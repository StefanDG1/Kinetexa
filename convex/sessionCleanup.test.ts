/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("removes unallocated revocations only after confirmed identity deletion and preserves registered accounts", async () => {
  const t = convexTest(schema, modules);
  vi.stubEnv("KINETEXA_ENVIRONMENT", "development");
  vi.stubEnv("WORKOS_API_KEY", "unit-fixture");
  const registered = t.withIdentity({
    subject: "registered",
    sid: "session-registered",
  });
  await registered.mutation(internal.athletes.ensureRecord, {});
  const subjects = ["gone", "live", "unavailable", "registered"];
  for (const subject of subjects)
    await t
      .withIdentity({ subject, sid: "session-" + subject })
      .mutation(internal.sessions.revoke, {});
  const request = vi.fn(
    async (url: string) =>
      new Response(null, {
        status: url.endsWith("/gone")
          ? 404
          : url.endsWith("/unavailable")
            ? 503
            : 200,
      }),
  );
  vi.stubGlobal("fetch", request);
  try {
    await t.action(internal.sessionActions.cleanupUnallocated, {});
    const remaining = await t.run((ctx) =>
      ctx.db.query("revokedSessions").collect(),
    );
    expect(remaining.map((r) => r.workosUserId).sort()).toEqual([
      "live",
      "registered",
      "unavailable",
    ]);
    expect(
      request.mock.calls.every(([url]) => !url.endsWith("/registered")),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
