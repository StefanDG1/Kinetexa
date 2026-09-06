import { it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { scanSnapshot } from "./backup.mjs";
import { scrubSnapshot } from "./restore-backup.mjs";
it("filters deleted athletes and every owned table from an actual snapshot while preserving another athlete and invalidating temporary exports", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kinetexa-backup-test-"),
  );
  try {
    const input = path.join(directory, "before.zip"),
      output = path.join(directory, "after.zip");
    const tables = {
      athletes: [
        { _id: "gone" },
        { _id: "keep", factsReady: true, factsCursor: "old" },
      ],
      activities: [
        { _id: "private", athleteId: "gone" },
        { _id: "retained", athleteId: "keep" },
      ],
      health: [{ athleteId: "gone", value: 123 }],
      productEvents: [
        { athleteId: "gone", event: "activity_viewed" },
        { athleteId: "keep", event: "activity_viewed", status: "sending" },
      ],
      messages: [{ athleteId: "gone", content: "Private" }],
      outbox: [
        {
          athleteId: "keep",
          status: "sending",
          payload: { to: "private@example.invalid" },
        },
      ],
      exportParts: [{ athleteId: "keep", key: "expired" }],
      lifecycleJobs: [
        {
          athleteId: "keep",
          kind: "export",
          status: "complete",
          key: "missing.zip",
        },
      ],
      sources: [
        { athleteId: "keep", status: "running", key: "retained.fit" },
        {
          athleteId: "keep",
          status: "processing-archive",
          key: "retained.zip",
          archiveScan: { cursor: "stale" },
        },
      ],
    };
    fs.writeFileSync(
      input,
      zipSync(
        Object.fromEntries(
          Object.entries(tables).map(([name, rows]) => [
            name + "/documents.jsonl",
            strToU8(rows.map((r) => JSON.stringify(r)).join("\n")),
          ]),
        ),
      ),
    );
    const before = [];
    await scanSnapshot(input, (table, row) => before.push({ table, row }));
    expect(before).toHaveLength(13);
    await scrubSnapshot(input, output, new Set(["gone"]));
    const after = [];
    await scanSnapshot(output, (table, row) => after.push({ table, row }));
    expect(JSON.stringify(after)).not.toContain('"gone"');
    expect(JSON.stringify(after)).not.toContain("private@example.invalid");
    expect(after.find((r) => r.table === "athletes").row).toEqual({
      _id: "keep",
      factsReady: false,
      analyticsConsent: false,
      analyticsConsentRevision: 1,
    });
    expect(
      strFromU8(
        unzipSync(fs.readFileSync(output))["activityFacts/documents.jsonl"],
      ),
    ).toBe("");
    expect(after.find((r) => r.table === "activities").row._id).toBe(
      "retained",
    );
    expect(after.find((r) => r.table === "lifecycleJobs").row).toMatchObject({
      status: "expired",
    });
    expect(
      after.find((r) => r.table === "lifecycleJobs").row.key,
    ).toBeUndefined();
    expect(after.find((r) => r.table === "outbox").row.status).toBe(
      "delivery-unknown",
    );
    expect(after.find((r) => r.table === "sources").row.status).toBe("failed");
    expect(
      after
        .filter((r) => r.table === "sources")
        .every(
          (r) => r.row.status === "failed" && r.row.archiveScan === undefined,
        ),
    ).toBe(true);
    expect(after.find((r) => r.table === "productEvents").row.status).toBe(
      "local-only",
    );
    expect(
      strFromU8(
        unzipSync(fs.readFileSync(output))["exportParts/documents.jsonl"],
      ),
    ).toBe("");
  } finally {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith("kinetexa-backup-test-")
    )
      throw Error("Unexpected test directory");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
