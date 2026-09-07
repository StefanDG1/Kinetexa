import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { traceEnvelope } from "./trace-format.mjs";

try {
  const config = JSON.parse(process.env.OPS_CONFIG || "null");
  if (!config?.convexUrl || !config.deploymentKey)
    throw new Error("Private configuration required.");
  const send = process.argv.includes("--send");
  if (send) {
    const endpoint = new URL(config.otlpEndpoint);
    if (
      endpoint.protocol !== "https:" &&
      !(
        endpoint.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
      )
    )
      throw new Error("Use HTTPS for a remote trace collector.");
  }
  const client = new ConvexHttpClient(config.convexUrl);
  client.setAdminAuth(config.deploymentKey);
  const until = Date.now(),
    since = until - 3600000,
    output = path.resolve(
      process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
        `work/traces-${until}.jsonl`,
    );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const file = fs.openSync(output, "wx");
  let cursor = null,
    count = 0;
  try {
    do {
      const result = await client.query("operations:events", {
        since,
        until,
        cursor,
      });
      const envelope = traceEnvelope(result.page, config.environment);
      const body = JSON.stringify(envelope);
      fs.writeSync(file, body + "\n");
      if (send && result.page.length) {
        const response = await fetch(config.otlpEndpoint, {
          method: "POST",
          headers: {
            ...config.otlpHeaders,
            "Content-Type": "application/json",
          },
          body,
          signal: AbortSignal.timeout(15000),
          redirect: "error",
        });
        if (!response.ok) throw new Error("Collector rejected traces.");
        // OTLP can return HTTP 200 while rejecting individual spans.
        const text = await response.text();
        const reply = text ? JSON.parse(text) : {};
        if (Number(reply.partialSuccess?.rejectedSpans ?? 0) > 0)
          throw new Error("Collector rejected some spans.");
      }
      count += envelope.resourceSpans[0].scopeSpans[0].spans.length;
      cursor = result.isDone ? null : result.continueCursor;
    } while (cursor);
  } finally {
    fs.closeSync(file);
  }
  console.log(
    JSON.stringify({ event: "trace_export_completed", spans: count }),
  );
} catch {
  console.error(
    "Trace export failed. Private configuration and payloads are excluded from logs.",
  );
  process.exitCode = 1;
}
