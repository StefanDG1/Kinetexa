"use node";
import {
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { client, downloadUrl } from "./storage";
import { closeCustomerBilling } from "./billingActions";
import { EXPORT_RETENTION_MS } from "./exportModel";
import { recordDeletion } from "./backups";
export const download = action({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, args): Promise<string> => {
    const j = await ctx.runQuery(api.lifecycle.owned, args);
    if (
      j.kind !== "export" ||
      j.status !== "complete" ||
      !j.key ||
      (j.expiresAt ?? j.createdAt + EXPORT_RETENTION_MS) <= Date.now()
    )
      throw new ConvexError("Export is not ready.");
    return downloadUrl(j.key);
  },
});
// Compatibility entry point for previously scheduled exports.
export const exportData = internalAction({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }): Promise<void> => {
    await ctx.runAction(internal.exportActions.run, { id });
  },
});
export const deleteData = internalAction({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const context = await ctx.runMutation(internal.lifecycle.claimDeletion, {
      id,
    });
    if (!context) return;
    const { athlete, job } = context;
    try {
      await recordDeletion(athlete._id);
      if (
        !job.notificationId &&
        !athlete.emailSuppressed &&
        process.env.RESEND_FROM_EMAIL
      ) {
        const recipient = await fetch(
          `https://api.workos.com/user_management/users/${athlete.workosUserId}`,
          {
            headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
            signal: AbortSignal.timeout(15000),
          },
        );
        if (recipient.ok) {
          const user = await recipient.json();
          await ctx.runMutation(internal.lifecycle.prepareNotification, {
            id,
            lease: job.lease,
            payload: {
              from: process.env.RESEND_FROM_EMAIL,
              to: process.env.KINETEXA_TEST_EMAIL || user.email,
              subject: "Your Kinetexa account has been deleted",
              text: "Your account, training files, application records and public links have been deleted. Any Kinetexa subscription has been canceled. Temporary backups expire within the configured retention window and are filtered against the deletion ledger during recovery. Stripe may retain required accounting records.\n\nSupport: contact@exponentialeducation.ro",
            },
          });
        } else if (recipient.status !== 404)
          throw new Error("Deletion notice preparation failed.");
      }
      const billing = await ctx.runQuery(internal.lifecycle.page, {
        athleteId: athlete._id,
        table: "billing",
        cursor: null,
      });
      for (const row of billing.page as any[]) {
        try {
          await closeCustomerBilling(row.customerId);
        } catch (e) {
          if ((e as any).code !== "resource_missing") throw e;
        }
      }
      const s3 = client();
      let keyMarker: string | undefined;
      let uploadIdMarker: string | undefined;
      do {
        const pending = await s3.send(
          new ListMultipartUploadsCommand({
            Bucket: process.env.R2_BUCKET,
            Prefix: `${athlete._id}/`,
            KeyMarker: keyMarker,
            UploadIdMarker: uploadIdMarker,
          }),
        );
        for (const upload of pending.Uploads ?? [])
          await s3.send(
            new AbortMultipartUploadCommand({
              Bucket: process.env.R2_BUCKET,
              Key: upload.Key,
              UploadId: upload.UploadId,
            }),
          );
        keyMarker = pending.IsTruncated ? pending.NextKeyMarker : undefined;
        uploadIdMarker = pending.IsTruncated
          ? pending.NextUploadIdMarker
          : undefined;
      } while (keyMarker);
      let token: string | undefined;
      do {
        const listed = await s3.send(
          new ListObjectsV2Command({
            Bucket: process.env.R2_BUCKET,
            Prefix: `${athlete._id}/`,
            ContinuationToken: token,
          }),
        );
        if (listed.Contents?.length) {
          const result = await s3.send(
            new DeleteObjectsCommand({
              Bucket: process.env.R2_BUCKET,
              Delete: {
                Objects: listed.Contents.map((o) => ({ Key: o.Key! })),
              },
            }),
          );
          if (result.Errors?.length)
            throw new Error("Some objects could not be deleted.");
        }
        token = listed.NextContinuationToken;
      } while (token);
      const response = await fetch(
        `https://api.workos.com/user_management/users/${athlete.workosUserId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok && response.status !== 404)
        throw new Error("Identity deletion failed.");
      while (
        !(await ctx.runMutation(internal.lifecycle.purgeBatch, {
          athleteId: athlete._id,
          jobId: id,
          lease: job.lease,
        }))
      ) {}
      console.info(JSON.stringify({ event: "deletion_completed", jobId: id }));
    } catch {
      await ctx.runMutation(internal.lifecycle.deletionFailed, {
        id,
        lease: job.lease,
      });
      console.error(JSON.stringify({ event: "deletion_failed", jobId: id }));
    }
  },
});
