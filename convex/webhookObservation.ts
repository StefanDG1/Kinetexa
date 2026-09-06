import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

/** Call only after provider signature verification. No request payload or signature is recorded. */
export async function observeWebhook(
  ctx: ActionCtx,
  metadata: {
    service: "stripe" | "resend";
    eventId: string;
    startedAt: number;
    bytes: number;
  },
  handle: () => Promise<"accepted" | "ignored" | "duplicate">,
) {
  const record = async (
    outcome: "accepted" | "ignored" | "duplicate" | "failed",
  ) => {
    try {
      await ctx.runMutation(internal.operations.webhook, {
        ...metadata,
        outcome,
      });
    } catch {
      console.error(
        JSON.stringify({
          event: "webhook_observation_failed",
          service: metadata.service,
        }),
      );
    }
  };
  let outcome: "accepted" | "ignored" | "duplicate";
  try {
    outcome = await handle();
  } catch (error) {
    await record("failed");
    throw error;
  }
  await record(outcome);
}
