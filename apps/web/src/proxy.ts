import { authkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextRequest, NextFetchEvent } from "next/server";

const authenticate = authkitProxy({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/pricing",
      "/privacy",
      "/terms",
      "/sign-in",
      "/sign-up",
      "/callback",
      "/api/health",
      "/.well-known/security.txt",
      "/api/webhooks/(.*)",
      "/share/(.*)",
    ],
  },
});

export default async function proxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV === "development";
  const backend = new URL(process.env.NEXT_PUBLIC_CONVEX_URL!).origin;
  const map = new URL(
    process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
      "https://tiles.openfreemap.org/styles/liberty",
  ).origin;
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // MapLibre and chart positioning use style attributes. Script execution still requires a nonce.
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' ${backend} ${backend.replace(/^http/, "ws")} ${map} https://*.r2.cloudflarestorage.com${development ? " ws://localhost:*" : ""}`,
    `img-src 'self' data: blob: ${map}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!development ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
  // Overwrite client-supplied values before AuthKit merges its private request headers.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const response = await authenticate(request, event);
  if (!response)
    throw new Error("Authentication proxy did not return a response.");
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js$|offline.html$|.*\\.(?:png|jpg|svg|woff2)$).*)",
  ],
};
