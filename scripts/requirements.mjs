import fs from "node:fs";

const source = fs.readFileSync("docs/sources/KINETEXA_PRD_v1.0.md", "utf8");
const rows = [...source.matchAll(/^##\s+([A-Z]+-\d+)\s+[^\n]*$/gm)].map(
  ([heading, id]) => {
    const title = heading.replace(/^##\s+/, "").replaceAll("|", "/");
    const later = /\[(V2|immediate V1\.x|P1\/V2)\]/.test(title);
    return `| ${id} | ${title.slice(id.length).trim()} | ${later ? "Deferred by PRD" : "Open"} | Pending |`;
  },
);
const path = "docs/requirements.md";
if (fs.existsSync(path))
  throw new Error(
    "Ledger already exists; edit statuses with evidence instead of overwriting.",
  );
fs.writeFileSync(
  path,
  `# V1 requirement ledger\n\nEvery numbered requirement from the unchanged PRD is listed below. Open means implementation or verification remains. Conditional provider requirements remain open until access and compliance evidence exists. Deferred rows follow the PRD, not a scope cut. See the PRD for acceptance criteria and section 45 for aggregate release gates.\n\n| ID | Requirement | Implementation | Verification evidence |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
);
console.log(`Recorded ${rows.length} requirements.`);
