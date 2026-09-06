import fs from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
const prod = process.argv.includes("--prod");
const env = parseEnv(
  fs.readFileSync(prod ? ".env.production.local" : ".env.local", "utf8"),
);
const keys = [
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
      ...(prod ? ["--prod"] : []),
      key,
      "--",
      env[key],
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.error(`Failed to configure ${key}`);
    process.exit(1);
  }
  console.log(`Configured ${key}`);
}
