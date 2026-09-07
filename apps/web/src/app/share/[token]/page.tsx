import type { Metadata } from "next";
import { fetchMutation } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { notFound } from "next/navigation";
import { SharedView } from "@/components/shared-view";
import { ConvexError } from "convex/values";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared training | Kinetexa",
  robots: { index: false, follow: false },
};
export default async function Share({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Reject malformed links before a network/database call.
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const data = await fetchMutation(api.sharing.publicView, { token }).catch(
    (error) => {
      if (
        error instanceof ConvexError &&
        error.data?.code === "SHARE_RATE_LIMITED"
      )
        return { rateLimited: true as const };
      throw error;
    },
  );
  if (!data) notFound();
  if ("rateLimited" in data)
    return (
      <main className="holding">
        <h1>This link is busy</h1>
        <p>Please try again in a minute.</p>
      </main>
    );
  return <SharedView data={data} />;
}
