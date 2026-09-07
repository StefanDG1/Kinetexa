import fs from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
const prod = process.argv.includes("--prod");
const staging = process.argv.includes("--staging");
if (prod && staging) throw new Error("Choose one environment.");
const envFile = prod
  ? ".env.production.local"
  : staging
    ? ".env.staging.local"
    : ".env.local";
const env = parseEnv(fs.readFileSync(envFile, "utf8"));
const expected = prod ? "production" : staging ? "staging" : "development";
if (env.KINETEXA_ENVIRONMENT !== expected)
  throw new Error("Environment file does not match the requested target.");
const keys = [
  "KINETEXA_ENVIRONMENT",
  "KINETEXA_APP_ENABLED",
  "KINETEXA_TELEMETRY_ENABLED",
  "POSTHOG_PROJECT_TOKEN",
  "POSTHOG_SECRET_KEY",
  "POSTHOG_PROJECT_ID",
  "BACKUP_ENDPOINT",
  "BACKUP_BUCKET",
  "BACKUP_ACCESS_KEY_ID",
  "BACKUP_SECRET_ACCESS_KEY",
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PREMIUM_MONTHLY_PRICE_ID",
  "STRIPE_PREMIUM_ANNUAL_PRICE_ID",
  "STRIPE_PORTAL_CONFIGURATION_ID",
  "AI_GATEWAY_API_KEY",
  "KINETEXA_AI_MODEL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_WEBHOOK_SECRET",
  "KINETEXA_TEST_EMAIL",
  "NEXT_PUBLIC_APP_URL",
];
for (const key of keys) {
  if (!env[key]) continue;
  const r = spawnSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "env",
      "set",
      "--env-file",
      envFile,
      key,
    ],
    { encoding: "utf8", input: env[key] },
  );
  if (r.status !== 0) {
    console.error(`Failed to configure ${key}`);
    process.exit(1);
  }
  console.log(`Configured ${key}`);
}
