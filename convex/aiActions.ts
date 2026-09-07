"use node";
import { v } from "convex/values";
import { z } from "zod";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  planSchema,
  medicalQuestion,
  privateQuestion,
  PRIVATE_BOUNDARY,
  MEDICAL_BOUNDARY,
  validateExplanation,
  modelEvidence,
  type Evidence,
} from "../packages/core/ai";
import {
  gatewayModel,
  PLANNER,
  EXPLAINER,
  type AiTelemetry,
} from "./aiProvider";
import { catalog, executePlan, readToolData } from "./aiData";
import { operationTiming } from "../packages/core/operation-timing";
import { findInsight } from "../packages/core/ai-insights";

function timedGateway(timing: ReturnType<typeof operationTiming>) {
  return (...args: Parameters<typeof gatewayModel.complete>) =>
    timing.measure(args[0] === PLANNER ? "ai.plan" : "ai.explain", () =>
      gatewayModel.complete(...args),
    );
}
export const ask = action({
  args: { question: v.string(), activityId: v.optional(v.id("activities")) },
  handler: async (ctx, { question, activityId }): Promise<void> => {
    const session = await ctx.runMutation(internal.ai.begin, { question }),
      deadline = Date.now() + 28000;
    const telemetry: AiTelemetry = {
      contextBytes: 0,
      toolCalls: 0,
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    const timing = operationTiming(),
      complete = timedGateway(timing);
    let stage = "loading",
      status = "failed",
      content =
        "An evidence-backed answer could not be produced. Try a narrower question.",
      evidence: Evidence[] = [];
    try {
      if (medicalQuestion(question)) {
        status = "medical-boundary";
        content = MEDICAL_BOUNDARY;
        return;
      }
      if (privateQuestion(question)) {
        status = "privacy-boundary";
        content = PRIVATE_BOUNDARY;
        return;
      }
      const data = await readToolData(
          ctx,
          session.runId,
          session.timezone,
          deadline,
          ["activities", "analyses", "goals", "gear"],
        ),
        sources = catalog(data, activityId);
      const history =
        /\b(that|those|same|instead|also|what about|and for|previous answer|follow.up)\b/i.test(
          question,
        )
          ? await ctx.runQuery(internal.ai.history, { runId: session.runId })
          : [];
      await ctx.runQuery(internal.ai.consent, { runId: session.runId });
      stage = "planning";
      const plan = planSchema.parse(
        await complete(
          PLANNER,
          {
            today: new Date().toISOString().slice(0, 10),
            timezone: session.timezone,
            question,
            history,
            catalog: sources.view,
          },
          deadline,
          telemetry,
        ),
      );
      if (plan.calls.some((c) => c.tool === "getHealthTrend")) {
        const health = await readToolData(
          ctx,
          session.runId,
          session.timezone,
          deadline,
          ["health"],
        );
        data.health = health.health;
        data.excluded += health.excluded;
      }
      telemetry.toolCalls = plan.calls.length;
      stage = "calculating";
      telemetry.tools = plan.calls.map((c) => c.tool);
      evidence = timing.sync("ai.tools", () =>
        executePlan(plan, data, sources.aliases),
      );
      const facts = modelEvidence(evidence);
      await ctx.runQuery(internal.ai.consent, { runId: session.runId });
      stage = "explaining";
      const answer = validateExplanation(
        await complete(EXPLAINER, { question, facts }, deadline, telemetry),
        evidence,
      );
      content = answer.summary;
      status = "completed";
    } catch (error) {
      const consentChanged =
        error instanceof Error && /consent/i.test(error.message);
      if (stage === "explaining" && evidence.length && !consentChanged) {
        status = "evidence-only";
        content =
          "The calculation completed, but the AI explanation could not be verified. The results below come directly from your recorded data.";
      } else {
        evidence = [];
        status = consentChanged
          ? "consent-revoked"
          : error instanceof Error && /timeout|timed out/i.test(error.message)
            ? "timeout"
            : `${stage}-failed`;
      }
      if (error instanceof z.ZodError)
        console.info(
          JSON.stringify({
            event: "ai_validation_failed",
            stage,
            issues: error.issues.map((i) => ({
              code: i.code,
              path: i.path
                .map((p) => (typeof p === "number" ? "item" : String(p)))
                .join("."),
            })),
          }),
        );
      // Errors are classified, never logged with provider bodies or private payloads.
    } finally {
      await ctx.runMutation(internal.ai.finish, {
        runId: session.runId,
        status,
        content,
        evidence,
        ...telemetry,
        phases: timing.phases,
      });
      console.info(
        JSON.stringify({
          event: "ai_run",
          status,
          durationMs: 28000 - (deadline - Date.now()),
          ...telemetry,
        }),
      );
    }
  },
});

export const refreshInsight = internalAction({
  args: { athleteId: v.id("athletes") },
  handler: async (ctx, { athleteId }): Promise<void> => {
    const eligibility = await ctx.runQuery(internal.ai.insightEligibility, {
      athleteId,
    });
    if (!eligibility) return;
    const fingerprint = `load-week-${eligibility.today}`,
      question =
        "Describe the recorded weekly training-load comparison, including uncertainty.";
    let session;
    try {
      session = await ctx.runMutation(internal.ai.begin, {
        question,
        athleteId,
        fingerprint,
      });
    } catch {
      return;
    }
    const deadline = Date.now() + 28000,
      telemetry: AiTelemetry = {
        contextBytes: 0,
        toolCalls: 0,
        modelCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    const timing = operationTiming(),
      complete = timedGateway(timing);
    let status = "no-finding",
      content = "",
      evidence: Evidence[] = [];
    try {
      const data = await readToolData(
        ctx,
        session.runId,
        session.timezone,
        deadline,
        ["activities"],
      );
      const candidate = timing.sync("ai.tools", () => findInsight(data));
      if (!candidate) return;
      evidence = candidate;
      telemetry.toolCalls = 1;
      telemetry.tools = ["getTrainingLoad"];
      const facts = modelEvidence(evidence);
      await ctx.runQuery(internal.ai.consent, { runId: session.runId });
      content = validateExplanation(
        await complete(EXPLAINER, { question, facts }, deadline, telemetry),
        evidence,
      ).summary;
      status = "completed";
    } catch {
      status = "failed";
      evidence = [];
    } finally {
      await ctx.runMutation(internal.ai.finish, {
        runId: session.runId,
        status,
        content,
        evidence,
        ...telemetry,
        phases: timing.phases,
      });
    }
  },
});
