import fs from "node:fs";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { traceEnvelope } from "./trace-format.mjs";

try {
  const config = JSON.parse(process.env.OPS_CONFIG || "null");
  if (!config?.convexUrl || !config.deploymentKey)
    throw new Error("Private configuration required.");
  const client = new ConvexHttpClient(config.convexUrl);
  client.setAdminAuth(config.deploymentKey);
  const until = Date.now(),
    since = until - 3600000,
    output = path.resolve(process.argv[2] ?? `work/traces-${until}.jsonl`);
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
      fs.writeSync(
        file,
        JSON.stringify(traceEnvelope(result.page, config.environment)) + "\n",
      );
      count += result.page.length;
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
