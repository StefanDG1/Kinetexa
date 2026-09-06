import { signOut, withAuth } from "@workos-inc/authkit-nextjs";
import { fetchAction } from "convex/nextjs";
import { api } from "@convex/_generated/api";
export async function GET() {
  try {
    const { accessToken } = await withAuth();
    if (accessToken)
      await fetchAction(api.sessionActions.logout, {}, { token: accessToken });
  } catch {
    console.error(JSON.stringify({ event: "session_logout_backend_failed" }));
  }
  await signOut();
}
