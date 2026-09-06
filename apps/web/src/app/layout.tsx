import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kinetexa | Your training, understood",
  description:
    "Private training analytics for runners and cyclists. Kinetexa is in development.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
