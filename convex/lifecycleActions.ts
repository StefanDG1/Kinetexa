"use node";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { client, downloadUrl } from "./storage";
import { closeCustomerBilling } from "./billingActions";
import { EXPORT_RETENTION_MS } from "./exportModel";
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
    const context = await ctx.runQuery(internal.lifecycle.context, { id });
    if (!context || context.athlete.status !== "deleting") return;
    const { athlete } = context;
    await ctx.runMutation(internal.lifecycle.status, { id, status: "running" });
    try {
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
        },
      );
      if (!response.ok && response.status !== 404)
        throw new Error("Identity deletion failed.");
      while (
        !(await ctx.runMutation(internal.lifecycle.purgeBatch, {
          athleteId: athlete._id,
          jobId: id,
        }))
      ) {}
      console.info(JSON.stringify({ event: "deletion_completed", jobId: id }));
    } catch {
      await ctx.runMutation(internal.lifecycle.status, {
        id,
        status: "failed",
        error: "Deletion needs operator attention. The account remains locked.",
      });
      console.error(JSON.stringify({ event: "deletion_failed", jobId: id }));
    }
  },
});
