/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("excludes non-consenting, withdrawn, and deleting accounts from internal reports", async () => {
  vi.stubEnv("KINETEXA_ENVIRONMENT", "staging");
  try {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "kpi-owner" });
    const id = await owner.mutation(api.athletes.ensure, {});
    await t
      .withIdentity({ subject: "kpi-other" })
      .mutation(api.athletes.ensure, {});
    await t.run((ctx) =>
      ctx.db.patch(id, { analyticsConsent: true, analyticsConsentRevision: 2 }),
    );
    const report = () =>
      t.action(internal.productKpis.report, {
        from: Date.now() - 86400000,
        to: Date.now(),
      });
    expect((await report()).consentingAthletes).toBe(1);
    expect(
      await t.query(internal.productKpis.read, {
        athleteId: id,
        revision: 1,
        kind: "events",
        cursor: null,
        since: 0,
      }),
    ).toBeNull();
    await t.run((ctx) => ctx.db.patch(id, { analyticsConsent: false }));
    expect((await report()).consentingAthletes).toBe(0);
    await t.run((ctx) =>
      ctx.db.patch(id, { analyticsConsent: true, status: "deleting" }),
    );
    expect((await report()).consentingAthletes).toBe(0);
  } finally {
    vi.unstubAllEnvs();
  }
});
