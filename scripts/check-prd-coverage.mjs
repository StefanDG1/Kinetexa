import fs from "node:fs";
const source = fs.readFileSync("docs/sources/KINETEXA_PRD_v1.0.md", "utf8"),
  ledger = fs.readFileSync("docs/requirements.md", "utf8");
const required = new Set(source.match(/\b[A-Z][A-Z0-9]*-\d{2,3}\b/g));
const rows = [...ledger.matchAll(/^\|\s*([A-Z][A-Z0-9]*-\d{2,3})\s*\|/gm)].map(
  (m) => m[1],
);
const missing = [...required].filter((id) => !rows.includes(id)),
  duplicates = rows.filter((id, i) => rows.indexOf(id) !== i);
if (missing.length || duplicates.length) {
  console.error({ missing, duplicates });
  process.exit(1);
}
console.log(
  `All ${required.size} source requirement/journey IDs have exactly one ledger row.`,
);
