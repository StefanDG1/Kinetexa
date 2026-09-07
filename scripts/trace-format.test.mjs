import { expect, it } from "vitest";
import { traceEnvelope } from "./trace-format.mjs";
it("exports OTLP identifiers and exact nanosecond timestamps without athlete or payload fields", () => {
  const result = traceEnvelope(
    [
      {
        kind: "webhook",
        service: "stripe",
        traceId: "a".repeat(32),
        spanId: "b".repeat(16),
        jobId: "job",
        outcome: "failed",
        athleteId: "private-owner",
        payload: "private-body",
        startedAt: 1788715200123,
        at: 1788715200456,
        measures: {
          phases: [
            {
              name: "parse.normalize",
              startedAt: 1788715200200,
              endedAt: 1788715200300,
              failed: true,
              payload: "private-phase",
            },
          ],
        },
      },
    ],
    "staging",
  );
  const span = result.resourceSpans[0].scopeSpans[0].spans[0];
  expect(span.startTimeUnixNano).toBe("1788715200123000000");
  expect(span.endTimeUnixNano).toBe("1788715200456000000");
  expect(span.status.code).toBe(2);
  const child = result.resourceSpans[0].scopeSpans[0].spans[1];
  expect(child.parentSpanId).toBe(span.spanId);
  expect(child.traceId).toBe(span.traceId);
  expect(child.spanId).toMatch(/^[a-f0-9]{16}$/);
  expect(child.startTimeUnixNano).toBe("1788715200200000000");
  expect(child.status.code).toBe(2);
  expect(span.attributes).toContainEqual({
    key: "kinetexa.webhook.provider",
    value: { stringValue: "stripe" },
  });
  expect(JSON.stringify(result)).not.toContain("private-owner");
  expect(JSON.stringify(result)).not.toContain("private-body");
  expect(JSON.stringify(result)).not.toContain("private-phase");
});
