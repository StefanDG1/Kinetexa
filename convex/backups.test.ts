import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const storage = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = storage.send;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
import { recordDeletion } from "./backups";
it("records identity-only deletion without an undefined athlete key and fails closed on ledger write failure", async () => {
  for (const key of [
    "BACKUP_ENDPOINT",
    "BACKUP_BUCKET",
    "BACKUP_ACCESS_KEY_ID",
    "BACKUP_SECRET_ACCESS_KEY",
  ])
    vi.stubEnv(key, "unit-fixture");
  vi.stubEnv("KINETEXA_ENVIRONMENT", "staging");
  try {
    storage.send.mockResolvedValue({});
    await recordDeletion(undefined, "deleted-identity");
    expect(storage.send).toHaveBeenCalledTimes(1);
    const key = `staging/tombstones/identity-${createHash("sha256").update("deleted-identity").digest("hex")}.json`;
    expect(storage.send.mock.calls[0][0].input.Key).toBe(key);
    expect(storage.send.mock.calls[0][0].input.Body).not.toContain(
      "deleted-identity",
    );
    storage.send.mockClear();
    storage.send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(recordDeletion("athlete", "deleted-identity")).rejects.toThrow(
      "storage unavailable",
    );
    expect(storage.send.mock.calls[1][0].input.Key).toBe(
      "staging/tombstones/athlete.json",
    );
  } finally {
    storage.send.mockReset();
    vi.unstubAllEnvs();
  }
});
