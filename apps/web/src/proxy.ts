import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware({
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
      "/api/webhooks/(.*)",
      "/share/(.*)",
    ],
  },
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|svg|woff2)$).*)",
  ],
};
