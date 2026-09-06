import type { Metadata } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { notFound } from "next/navigation";
import { SharedView } from "@/components/shared-view";
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
  const data = await fetchQuery(api.sharing.publicView, { token });
  if (!data) notFound();
  return <SharedView data={data} />;
}
