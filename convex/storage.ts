"use node";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";
import { activityJsonChunks } from "../packages/core/activity-json";
import type { Activity } from "../packages/core/model";
function env(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Storage configuration missing: ${key}`);
  return v;
}
export function client() {
  return new S3Client({
    region: "auto",
    endpoint: env("R2_ENDPOINT"),
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  });
}
export async function getObject(key: string) {
  const r = await client().send(
    new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }),
  );
  if (!r.Body) throw new Error("Stored object is empty.");
  return r.Body.transformToByteArray();
}
export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
) {
  await client().send(
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
}
export async function putActivity(key: string, activity: Activity) {
  const body = Readable.from(
    (function* () {
      for (const chunk of activityJsonChunks(activity))
        yield Buffer.from(chunk);
    })(),
  );
  await new Upload({
    client: client(),
    params: {
      Bucket: env("R2_BUCKET"),
      Key: key,
      Body: body,
      ContentType: "application/json",
    },
    queueSize: 1,
    partSize: 5 * 1024 * 1024,
    leavePartsOnError: false,
  }).done();
}
export async function removeObject(key: string) {
  await client().send(
    new DeleteObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }),
  );
}
export async function objectSize(key: string) {
  return (
    (
      await client().send(
        new HeadObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }),
      )
    ).ContentLength ?? 0
  );
}
export async function uploadUrl(key: string, bytes: number) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      ContentLength: bytes,
      ContentType: "application/octet-stream",
    }),
    { expiresIn: 600 },
  );
}
export async function downloadUrl(key: string) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      ResponseContentDisposition: "attachment",
    }),
    { expiresIn: 60 },
  );
}
