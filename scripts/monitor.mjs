import { ConvexHttpClient } from "convex/browser";

try {
  const config = JSON.parse(process.env.OPS_CONFIG || "null");
  if (
    !config?.convexUrl ||
    !config.deploymentKey ||
    !["staging", "production"].includes(config.environment)
  )
    throw new Error("Configuration unavailable.");
  const client = new ConvexHttpClient(config.convexUrl, {
    fetch: (url, options) =>
      fetch(url, { ...options, signal: AbortSignal.timeout(60000) }),
  });
  client.setAdminAuth(config.deploymentKey);
  const result = await client.action("operations:check", {});
  if (config.webHealthUrl) {
    const response = await fetch(config.webHealthUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok || (await response.json()).status !== "ok")
      throw new Error("Web health check failed.");
  }
  console.log(
    JSON.stringify({
      event: "operational_check",
      environment: config.environment,
      at: result.at,
      actionRequired: result.alerts.length > 0,
      newAlertCount: result.newAlerts.length,
      recoveredCount: result.recovered.length,
    }),
  );
  if (result.newAlerts.length) {
    console.error(
      "New operational alerts require review. Inspect the private operator APIs.",
    );
    process.exitCode = 1;
  }
} catch {
  console.error(
    JSON.stringify({
      event: "operational_check_failed",
      message:
        "Monitoring failed. Private configuration and service response bodies are excluded from logs.",
    }),
  );
  process.exitCode = 1;
}
