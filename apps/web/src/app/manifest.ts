import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kinetexa",
    short_name: "Kinetexa",
    description: "Your private training workspace",
    id: "/",
    scope: "/",
    start_url: "/home",
    display: "standalone",
    background_color: "#F7FAFC",
    theme_color: "#16384B",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
