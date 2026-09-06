"use node";
import { v } from "convex/values";
import { Webhook } from "svix";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { observeWebhook } from "./webhookObservation";
const templates: Record<string, { subject: string; text: string }> = {
  welcome: {
    subject: "Your private Kinetexa workspace",
    text: "Your account is ready. Import your activity files to begin. Your training stays private unless you create a public link.",
  },
  import: {
    subject: "Your Kinetexa import is ready",
    text: "Activity processing has completed. Open your import history to review the results and any duplicate suggestions.",
  },
  export: {
    subject: "Your Kinetexa export is ready",
    text: "Your account export is ready. Sign in and open Settings to download it securely.",
  },
  billing: {
    subject: "Your Kinetexa subscription changed",
    text: "Your subscription status has changed. Open Your plan to review it. Your canonical activity history is preserved.",
  },
};
export const send = internalAction({
  args: { id: v.id("outbox") },
  handler: async (ctx, { id }) => {
    const claimed = await ctx.runMutation(internal.email.claim, { id });
    if (!claimed) return;
    let retryable = true;
    try {
      if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
        retryable = false;
        throw new Error("Mail unavailable");
      }
      let payload = claimed.row.payload;
      if (!payload) {
        const r = await fetch(
          `https://api.workos.com/user_management/users/${claimed.userId}`,
          {
            headers: { Authorization: `Bearer ${process.env.WORKOS_API_KEY}` },
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!r.ok) {
          retryable = r.status >= 500 || r.status === 429;
          throw new Error("Recipient unavailable");
        }
        const user = await r.json(),
          template = templates[claimed.row.template];
        if (!template) {
          retryable = false;
          throw new Error("Template unavailable");
        }
        payload = {
          from: process.env.RESEND_FROM_EMAIL,
          to: process.env.KINETEXA_TEST_EMAIL || user.email,
          subject: template.subject,
          text: `${template.text}\n\n${process.env.NEXT_PUBLIC_APP_URL}\n\nSupport: contact@exponentialeducation.ro`,
        };
      }
      payload = await ctx.runMutation(internal.email.rememberPayload, {
        id,
        attempt: claimed.attempt,
        payload,
      });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": claimed.row.dedupeKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        retryable =
          response.status >= 500 || [409, 429].includes(response.status);
        throw new Error("Email delivery unavailable");
      }
      const body = await response.json();
      if (typeof body.id !== "string" || !body.id)
        throw new Error("Email acceptance was not confirmed.");
      await ctx.runMutation(internal.email.result, {
        id,
        attempt: claimed.attempt,
        providerId: body.id,
        failed: false,
      });
    } catch {
      await ctx.runMutation(internal.email.result, {
        id,
        attempt: claimed.attempt,
        failed: true,
        retryable,
      });
      console.error(JSON.stringify({ event: "email_failed", jobId: id }));
    }
  },
});
export const webhook = internalAction({
  args: { body: v.string(), headers: v.any() },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    if (!process.env.RESEND_WEBHOOK_SECRET)
      throw new Error("Webhook unavailable");
    new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(
      args.body,
      args.headers,
    );
    await observeWebhook(
      ctx,
      {
        service: "resend",
        eventId: args.headers["svix-id"],
        startedAt,
        bytes: Buffer.byteLength(args.body),
      },
      async () => {
        const event = JSON.parse(args.body) as {
          type: string;
          created_at: string;
          data: { email_id: string };
        };
        const states: Record<
          string,
          "delivered" | "bounced" | "complained" | "failed"
        > = {
          "email.delivered": "delivered",
          "email.bounced": "bounced",
          "email.complained": "complained",
          "email.failed": "failed",
        };
        if (
          !Number.isFinite(Date.parse(event.created_at)) ||
          Date.parse(event.created_at) > Date.now() + 300000
        )
          throw new Error("Invalid email event time.");
        if (states[event.type])
          return ctx.runMutation(internal.email.delivery, {
            providerId: event.data.email_id,
            status: states[event.type],
            occurredAt: Date.parse(event.created_at),
            eventId: args.headers["svix-id"],
          });
        return "ignored";
      },
    );
  },
});
