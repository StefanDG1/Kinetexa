"use node";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
// A restore consults this independent deletion ledger even when its database snapshot predates deletion.
export async function recordDeletion(
  athleteId: string | undefined,
  workosUserId: string,
) {
  const environment = process.env.KINETEXA_ENVIRONMENT;
  if (environment === "development") return;
  if (
    !environment ||
    !["staging", "production"].includes(environment) ||
    !process.env.BACKUP_ENDPOINT ||
    !process.env.BACKUP_BUCKET ||
    !process.env.BACKUP_ACCESS_KEY_ID ||
    !process.env.BACKUP_SECRET_ACCESS_KEY
  )
    throw new Error("The deletion ledger is not configured.");
  const client = new S3Client({
    endpoint: process.env.BACKUP_ENDPOINT,
    region: "auto",
    credentials: {
      accessKeyId: process.env.BACKUP_ACCESS_KEY_ID,
      secretAccessKey: process.env.BACKUP_SECRET_ACCESS_KEY,
    },
  });
  const identityKey = `identity-${createHash("sha256").update(workosUserId).digest("hex")}`;
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.BACKUP_BUCKET,
      Key: `${environment}/tombstones/${identityKey}.json`,
      Body: JSON.stringify({
        identityHash: identityKey,
        deletedAt: Date.now(),
        version: 2,
      }),
      ContentType: "application/json",
    }),
  );
  if (athleteId)
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.BACKUP_BUCKET,
        Key: `${environment}/tombstones/${athleteId}.json`,
        Body: JSON.stringify({ athleteId, deletedAt: Date.now(), version: 1 }),
        ContentType: "application/json",
      }),
    );
}
