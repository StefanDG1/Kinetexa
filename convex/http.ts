import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { boundedRequestText } from "../packages/core/request-body";
const http = httpRouter();
http.route({
  path: "/resend",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await boundedRequestText(request);
    if (body === null) return new Response("Too large", { status: 413 });
    try {
      await ctx.runAction(internal.emailActions.webhook, {
        body,
        headers: Object.fromEntries(
          ["svix-id", "svix-timestamp", "svix-signature"].map((k) => [
            k,
            request.headers.get(k) ?? "",
          ]),
        ),
      });
      return new Response("ok");
    } catch {
      return new Response("Rejected", { status: 400 });
    }
  }),
});
http.route({
  path: "/stripe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await boundedRequestText(request);
    if (body === null) return new Response("Too large", { status: 413 });
    try {
      await ctx.runAction(internal.billingActions.webhook, {
        body,
        signature: request.headers.get("stripe-signature") ?? "",
      });
      return new Response("ok");
    } catch {
      console.error(JSON.stringify({ event: "stripe_webhook_failed" }));
      return new Response("Webhook rejected or processing unavailable", {
        status: 400,
      });
    }
  }),
});
export default http;
