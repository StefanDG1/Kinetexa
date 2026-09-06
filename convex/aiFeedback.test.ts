/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
const modules = import.meta.glob("./**/*.ts");
it("keeps answer feedback private, editable and removable, and aggregates only consenting owners with valid evidence", async () => {
  vi.stubEnv("KINETEXA_ENVIRONMENT", "staging");
  try {
    const t = convexTest(schema, modules),
      a = t.withIdentity({ subject: "feedback-owner" }),
      b = t.withIdentity({ subject: "feedback-other" });
    const athleteId = await a.mutation(api.athletes.ensure, {});
    await b.mutation(api.athletes.ensure, {});
    const id = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("aiRuns", {
        athleteId,
        revision: 0,
        purpose: "ask",
        status: "completed",
        startedAt: Date.now() - 2000,
        finishedAt: Date.now() - 1000,
        contextBytes: 0,
        toolCalls: 1,
        modelCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
      });
      return ctx.db.insert("messages", {
        athleteId,
        role: "assistant",
        content: "Private answer",
        at: Date.now() - 1000,
        runId,
        evidence: [
          {
            id: "count",
            label: "Activities",
            value: 2,
            unit: "activities",
            from: "2026-08-01",
            to: "2026-09-01",
            activityIds: [],
            sourceCount: 2,
            sourcesComplete: true,
            caveats: [],
          },
        ],
      });
    });
    await expect(
      b.mutation(api.ai.feedback, { messageId: id, helpful: true }),
    ).rejects.toThrow("unavailable");
    await expect(
      t.mutation(api.ai.feedback, { messageId: id, helpful: true }),
    ).rejects.toThrow("Sign in");
    await a.mutation(api.ai.feedback, { messageId: id, helpful: false });
    const first = await t.run((ctx) => ctx.db.get(id));
    await a.mutation(api.ai.feedback, { messageId: id, helpful: false });
    expect((await t.run((ctx) => ctx.db.get(id)))?.feedback).toEqual(
      first?.feedback,
    );
    const report = () =>
      t.action(internal.productKpis.report, {
        from: Date.now() - 86400000,
        to: Date.now(),
      });
    expect(
      (await report()).aiGroundedAnswerSuccess.userFeedback.denominator,
    ).toBe(0);
    await t.run((ctx) => ctx.db.patch(athleteId, { analyticsConsent: true }));
    expect((await report()).aiGroundedAnswerSuccess.userFeedback).toEqual({
      numerator: 0,
      denominator: 1,
      percent: 0,
      eligibleAnswers: 1,
    });
    await a.mutation(api.ai.feedback, { messageId: id, helpful: true });
    expect((await report()).aiGroundedAnswerSuccess.userFeedback.percent).toBe(
      100,
    );
    await a.mutation(api.ai.feedback, { messageId: id, helpful: null });
    expect(
      (await report()).aiGroundedAnswerSuccess.userFeedback.percent,
    ).toBeNull();
    await t.run((ctx) => ctx.db.patch(id, { evidence: [] }));
    await a.mutation(api.ai.feedback, { messageId: id, helpful: null });
    await expect(
      a.mutation(api.ai.feedback, { messageId: id, helpful: true }),
    ).rejects.toThrow("with evidence");
    expect(
      (await report()).aiGroundedAnswerSuccess.userFeedback.eligibleAnswers,
    ).toBe(0);
  } finally {
    vi.unstubAllEnvs();
  }
});
