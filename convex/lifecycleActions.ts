"use node";
import { PassThrough } from "node:stream";
import { Zip, ZipPassThrough } from "fflate";
import { Upload } from "@aws-sdk/lib-storage";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { client, getObject, downloadUrl } from "./storage";
import { closeCustomerBilling } from "./billingActions";
import { tables } from "./lifecycle";
const tableNames = tables.filter((table) => table !== "lifecycleJobs");
export const download = action({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, args): Promise<string> => {
    const j = await ctx.runQuery(api.lifecycle.owned, args);
    if (j.status !== "complete" || !j.key)
      throw new ConvexError("Export is not ready.");
    return downloadUrl(j.key);
  },
});
export const exportData = internalAction({
  args: { id: v.id("lifecycleJobs") },
  handler: async (ctx, { id }) => {
    const context = await ctx.runQuery(internal.lifecycle.context, { id });
    if (!context || context.athlete.status !== "active") return;
    const { athlete } = context,
      key = `${athlete._id}/exports/${id}.zip`;
    await ctx.runMutation(internal.lifecycle.status, { id, status: "running" });
    const stream = new PassThrough(),
      upload = new Upload({
        client: client(),
        params: {
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: stream,
          ContentType: "application/zip",
        },
        queueSize: 1,
        partSize: 5 * 1024 * 1024,
      });
    const uploaded = upload.done();
    uploaded.catch(() => {});
    const zip = new Zip((error, data, final) => {
      if (error) {
        stream.destroy(error);
        return;
      }
      stream.write(data);
      if (final) stream.end();
    });
    const add = (name: string, bytes: Uint8Array) => {
      const f = new ZipPassThrough(name);
      zip.add(f);
      f.push(bytes, true);
    };
    const drain = async () => {
      if (stream.destroyed) throw new Error("Export upload interrupted.");
      if (stream.writableNeedDrain)
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            stream.off("drain", done);
            stream.off("error", fail);
            stream.off("close", closed);
          };
          const done = () => {
            cleanup();
            resolve();
          };
          const fail = (error: Error) => {
            cleanup();
            reject(error);
          };
          const closed = () => fail(new Error("Export stream closed."));
          stream.once("drain", done);
          stream.once("error", fail);
          stream.once("close", closed);
        });
    };
    try {
      const {
        tokenIdentifier: _token,
        workosUserId: _user,
        ...profile
      } = athlete;
      add("profile.json", Buffer.from(JSON.stringify(profile)));
      add(
        "README.txt",
        Buffer.from(
          "Kinetexa account export. Data uses SI units and UTC millisecond timestamps. Table files contain JSON arrays. Original source files are unchanged. Canonical stream files include samples and laps.",
        ),
      );
      for (const table of tableNames) {
        let cursor: string | null = null,
          page = 0;
        do {
          const result: {
            page: unknown[];
            isDone: boolean;
            continueCursor: string;
          } = await ctx.runQuery(internal.lifecycle.page, {
            athleteId: athlete._id,
            table,
            cursor,
          });
          add(
            `data/${table}-${page++}.json`,
            Buffer.from(JSON.stringify(result.page)),
          );
          if (table === "sources")
            for (const row of result.page as any[]) {
              if (row.status !== "awaiting-upload") {
                add(
                  `originals/${row._id}/${row.name.replaceAll("\\", "/").split("/").at(-1)}`,
                  await getObject(row.key),
                );
                await drain();
              }
            }
          if (table === "activities")
            for (const row of result.page as any[]) {
              add(`canonical/${row._id}.json`, await getObject(row.streamKey));
              await drain();
            }
          await drain();
          cursor = result.isDone ? null : result.continueCursor;
        } while (cursor);
      }
      zip.end();
      await uploaded;
      await ctx.runMutation(internal.lifecycle.status, {
        id,
        status: "complete",
        key,
      });
      await ctx.runMutation(internal.email.enqueue, {
        athleteId: athlete._id,
        template: "export",
        dedupeKey: `export-${id}`,
      });
      console.info(JSON.stringify({ event: "export_completed", jobId: id }));
    } catch {
      zip.terminate();
      stream.destroy();
      await upload.abort();
      await ctx.runMutation(internal.lifecycle.status, {
        id,
        status: "failed",
        error:
          "Export could not finish. Your data is retained. Contact support to retry.",
      });
      console.error(JSON.stringify({ event: "export_failed", jobId: id }));
    }
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
