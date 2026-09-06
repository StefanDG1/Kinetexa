import fs from "node:fs";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";
const secrets = [];
for (const file of [
  ".env.local",
  ".env.production.local",
  ".env.staging.local",
])
  if (fs.existsSync(file))
    for (const [k, v] of Object.entries(
      parseEnv(fs.readFileSync(file, "utf8")),
    ))
      if (
        !k.startsWith("NEXT_PUBLIC_") &&
        /SECRET|PASSWORD|API_KEY|ACCESS_KEY|TOKEN|DEPLOY_KEY/.test(k) &&
        v.length >= 16
      )
        secrets.push(v);
const files = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
let bad = false;
for (const file of files) {
  const content = execFileSync("git", ["show", `:${file}`], {
    maxBuffer: 32 * 1024 * 1024,
  }).toString();
  if (secrets.some((s) => content.includes(s))) {
    console.error(`Secret found in staged file: ${file}`);
    bad = true;
  }
}
if (bad) process.exit(1);
console.log(`Staged secret comparison passed for ${files.length} files.`);
