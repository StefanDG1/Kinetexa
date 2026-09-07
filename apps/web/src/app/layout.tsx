import type { Metadata } from "next";
import { connection } from "next/server";
import { OfflineShell } from "@/components/offline-shell";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = {
  icons: { apple: "/apple-icon.png" },
  title: "Kinetexa | Your training, understood",
  description:
    "Private training analytics for runners and cyclists. Kinetexa is in development.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Each HTML response needs its own script nonce, so it cannot be prerendered.
  await connection();
  return (
    <html lang="en">
      <body>
        <OfflineShell />
        {children}
      </body>
    </html>
  );
}
