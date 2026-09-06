import { ConvexHttpClient } from "convex/browser";
import { AI_EVALS, AI_EVAL_VERSION } from "../packages/core/ai-evals.ts";
import { pathToFileURL } from "node:url";
export async function evaluateAi(client, ids) {
  const results = [];
  for (const fixture of AI_EVALS.filter((f) => ids.includes(f.id))) {
    const start = Date.now();
    await client.action("aiActions:ask", { question: fixture.question });
    const messages = await client.query("ai:messages", {
        paginationOpts: { numItems: 2, cursor: null },
      }),
      answer = messages.page.find((m) => m.role === "assistant"),
      run = await client.query("ai:runStatus", { id: answer.runId });
    const evidence = answer.evidence ?? [],
      close = (n, want) => n !== null && Math.abs(n - want) < 0.00001;
    const checks =
      "boundary" in fixture
        ? {
            boundary: run.status === fixture.boundary,
            noTransmission: run.modelCalls === 0,
          }
        : {
            completed: run.status === "completed",
            toolChoice: run.tools?.includes(fixture.tool) ?? false,
            quantitativeAccuracy: evidence.some((e) =>
              close(e.value, fixture.expectedValue),
            ),
            ...("expectedComparison" in fixture
              ? {
                  comparison: evidence.some((e) =>
                    close(
                      e.comparison?.value ?? null,
                      fixture.expectedComparison,
                    ),
                  ),
                }
              : {}),
            ...("requiresUnavailable" in fixture
              ? { missingData: evidence.some((e) => e.value === null) }
              : {}),
          };
    results.push({
      id: fixture.id,
      checks,
      passed: Object.values(checks).every(Boolean),
      durationMs: Date.now() - start,
      model: run.model ?? null,
      modelCalls: run.modelCalls,
      contextBytes: run.contextBytes,
      costMicrousd: run.costMicrousd ?? null,
      summary: answer.content,
    });
  }
  return { version: AI_EVAL_VERSION, at: new Date().toISOString(), results };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.KINETEXA_EVAL_URL || !process.env.KINETEXA_EVAL_TOKEN)
    throw Error(
      "Set a synthetic staging URL and short-lived evaluation token privately.",
    );
  const client = new ConvexHttpClient(process.env.KINETEXA_EVAL_URL);
  client.setAuth(process.env.KINETEXA_EVAL_TOKEN);
  // Run at most three cases per invocation to respect the product's minute limit.
  const ids = process.argv.slice(2);
  if (!ids.length || ids.length > 3)
    throw Error("Choose one to three case IDs from packages/core/ai-evals.ts.");
  const report = await evaluateAi(client, ids);
  console.log(JSON.stringify(report, null, 2));
  if (report.results.some((r) => !r.passed)) process.exitCode = 1;
}
