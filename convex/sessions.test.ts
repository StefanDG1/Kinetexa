/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { it, expect, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("blocks a session logged out before registration, including after a fresh session creates the account", async () => {
  const t = convexTest(schema, modules),
    old = t.withIdentity({ subject: "new-owner", sid: "old-session" }),
    fresh = t.withIdentity({ subject: "new-owner", sid: "new-session" });
  vi.stubEnv("WORKOS_API_KEY", "unit-fixture");
  const request = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", request);
  try {
    await expect(old.action(api.sessionActions.logout, {})).rejects.toThrow(
      "unavailable",
    );
    await expect(old.action(api.athletes.ensure, {})).rejects.toThrow(
      "Sign in",
    );
    const id = await fresh.mutation(internal.athletes.ensureRecord, {});
    expect(await old.query(api.athletes.current, {})).toBeNull();
    expect(await fresh.query(api.athletes.current, {})).not.toBeNull();
    const first = await t.query(internal.lifecycle.page, {
      athleteId: id,
      table: "revokedSessions",
      cursor: null,
    });
    const second = await t.query(internal.lifecycle.page, {
      athleteId: id,
      table: "revokedSessions",
      cursor: first.continueCursor,
    });
    expect(second.page).toHaveLength(1);
    expect(second.isDone).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
it("revokes only the signed session, blocks private reads and writes immediately and preserves account identity", async () => {
  const t = convexTest(schema, modules),
    first = t.withIdentity({
      subject: "owner",
      email: "same@example.test",
      sid: "session_first",
    }),
    second = t.withIdentity({
      subject: "owner",
      email: "changed@example.test",
      sid: "session_second",
    }),
    different = t.withIdentity({
      subject: "other",
      email: "same@example.test",
      sid: "session_other",
    });
  const id = await first.mutation(internal.athletes.ensureRecord);
  expect(await second.mutation(internal.athletes.ensureRecord)).toBe(id);
  expect(await different.mutation(internal.athletes.ensureRecord)).not.toBe(id);
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WORKOS_API_KEY", "unit-fixture");
  try {
    expect(await first.action(api.sessionActions.logout, {})).toEqual({
      revoked: true,
    });
    expect(await first.query(api.athletes.current, {})).toBeNull();
    await expect(first.query(api.activities.list, {})).rejects.toThrow(
      "Sign in",
    );
    await expect(
      first.mutation(internal.athletes.ensureRecord, {}),
    ).rejects.toThrow("Sign in");
    expect(await second.query(api.athletes.current, {})).not.toBeNull();
    expect(await different.query(api.athletes.current, {})).not.toBeNull();
    await first.action(api.sessionActions.logout, {});
    const rows = await t.run((ctx) =>
      ctx.db.query("revokedSessions").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("session_first");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.workos.com/user_management/sessions/revoke",
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      session_id: "session_first",
    });
    const exported = await t.query(internal.lifecycle.page, {
      athleteId: id,
      table: "revokedSessions",
      cursor: null,
    });
    const identityExport = await t.query(internal.lifecycle.page, {
      athleteId: id,
      table: "revokedSessions",
      cursor: exported.continueCursor,
    });
    expect([...exported.page, ...identityExport.page]).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
it("keeps API denial when the session provider fails and rejects anonymous logout", async () => {
  const t = convexTest(schema, modules),
    owner = t.withIdentity({
      subject: "owner",
      sid: "session_failed_provider",
    });
  await owner.mutation(internal.athletes.ensureRecord);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  vi.stubEnv("WORKOS_API_KEY", "unit-fixture");
  try {
    await expect(owner.action(api.sessionActions.logout, {})).rejects.toThrow(
      "unavailable",
    );
    expect(await owner.query(api.athletes.current, {})).toBeNull();
    await expect(t.action(api.sessionActions.logout, {})).rejects.toThrow(
      "No active",
    );
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
