import fs from "node:fs";
import { parseEnv } from "node:util";

// Local inspection only. Never contacts a service or prints configuration values.
const filename = ".env.local";
if (!fs.existsSync(filename)) {
  console.error(
    "Copy .env.example to .env.local and configure a separate development project.",
  );
  process.exit(1);
}
const env = parseEnv(fs.readFileSync(filename, "utf8"));
const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
];
const problems = [];
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 14))
  problems.push("Use Node 24 LTS, or at least 22.14.");
for (const name of required)
  if (!env[name]?.trim()) problems.push(`Missing ${name}`);
for (const name of [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
  "R2_ENDPOINT",
]) {
  if (!env[name]) continue;
  try {
    const url = new URL(env[name]);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
  } catch {
    problems.push(`Invalid URL in ${name}`);
  }
}
if (env.WORKOS_COOKIE_PASSWORD && env.WORKOS_COOKIE_PASSWORD.length < 32)
  problems.push("WORKOS_COOKIE_PASSWORD needs at least 32 characters.");
if (env.KINETEXA_ENVIRONMENT !== "development")
  problems.push("KINETEXA_ENVIRONMENT must be development for this helper.");
if (env.STRIPE_SECRET_KEY && !/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY))
  problems.push("Development billing must use a Stripe test key.");
if (problems.length) {
  problems.forEach((p) => console.error(p));
  process.exit(1);
}
if (process.argv.includes("--write-web")) {
  const target = "apps/web/.env.local";
  const keys = [
    "KINETEXA_ENVIRONMENT",
    "KINETEXA_APP_ENABLED",
    "KINETEXA_PAYMENTS_ENABLED",
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_CONVEX_URL",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
    "WORKOS_CLIENT_ID",
    "WORKOS_API_KEY",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_MAP_STYLE_URL",
    "NEXT_PUBLIC_POSTHOG_KEY",
    "NEXT_PUBLIC_POSTHOG_HOST",
  ];
  // Exclusive creation protects existing private setup. Copy only web-owned keys.
  fs.writeFileSync(
    target,
    keys
      .filter((k) => env[k] !== undefined)
      .map((k) => `${k}=${JSON.stringify(env[k])}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created apps/web/.env.local. Backend/storage/billing credentials were not copied.",
  );
}
console.log(
  "Local configuration shape passed. Credentials, remote deployment settings and service access have not been verified.",
);
console.log(
  "Optional services: billing, email, AI and telemetry require their separate setup and consent. See docs/local-development.md.",
);
