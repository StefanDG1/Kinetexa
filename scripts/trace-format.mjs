// OTLP/JSON uses hex trace/span IDs, numeric enums and decimal strings for int64.
// https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding
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
            spans: events.map((event) => ({
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
                { key: "kinetexa.job.id", value: { stringValue: event.jobId } },
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
                code: /failed|timeout|interrupted/.test(event.outcome) ? 2 : 1,
              },
            })),
          },
        ],
      },
    ],
  };
}
