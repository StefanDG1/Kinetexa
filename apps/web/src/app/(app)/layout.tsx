import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.KINETEXA_APP_ENABLED !== "true") redirect("/");
  await withAuth({ ensureSignedIn: true });
  return (
    <Providers>
      <Shell>{children}</Shell>
    </Providers>
  );
}
