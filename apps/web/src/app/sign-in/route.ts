import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export async function GET() {
  if (process.env.KINETEXA_APP_ENABLED !== "true") redirect("/");
  redirect(await getSignInUrl());
}
