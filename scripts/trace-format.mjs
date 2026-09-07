// OTLP/JSON uses hex trace/span IDs, numeric enums and decimal strings for int64.
// https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding
import { createHash } from "node:crypto";
export function traceEnvelope(events, environment) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "kinetexa-backend" } },
            {
              key: "deployment.environment.name",
              value: { stringValue: environment },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "kinetexa.operations" },
            spans: events.flatMap((event) => [
              {
                traceId: event.traceId,
                spanId: event.spanId,
                name: event.kind,
                kind: 1,
                startTimeUnixNano: (
                  BigInt(Math.trunc(event.startedAt ?? event.at)) * 1000000n
                ).toString(),
                endTimeUnixNano: (
                  BigInt(Math.trunc(event.at)) * 1000000n
                ).toString(),
                attributes: [
                  ...(event.service
                    ? [
                        {
                          key: "kinetexa.webhook.provider",
                          value: {
                            stringValue: event.service,
                          },
                        },
                      ]
                    : []),
                  {
                    key: "kinetexa.job.id",
                    value: { stringValue: event.jobId },
                  },
                  {
                    key: "kinetexa.outcome",
                    value: { stringValue: event.outcome },
                  },
                  {
                    key: "kinetexa.timing.known",
                    value: { boolValue: event.startedAt !== undefined },
                  },
                ],
                status: {
                  code: /failed|timeout|interrupted/.test(event.outcome)
                    ? 2
                    : 1,
                },
              },
              ...(event.measures?.phases ?? [])
                .slice(0, 32)
                .map((phase, index) => ({
                  traceId: event.traceId,
                  spanId: createHash("sha256")
                    .update(`${event.spanId}:${index}`)
                    .digest("hex")
                    .slice(0, 16),
                  parentSpanId: event.spanId,
                  name: phase.name,
                  kind: 1,
                  startTimeUnixNano: (
                    BigInt(Math.trunc(phase.startedAt)) * 1000000n
                  ).toString(),
                  endTimeUnixNano: (
                    BigInt(Math.trunc(phase.endedAt)) * 1000000n
                  ).toString(),
                  status: { code: phase.failed ? 2 : 1 },
                  attributes: [],
                })),
            ]),
          },
        ],
      },
    ],
  };
}
