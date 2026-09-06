import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kinetexa",
    short_name: "Kinetexa",
    description: "Your private training workspace",
    start_url: "/home",
    display: "standalone",
    background_color: "#F7FAFC",
    theme_color: "#16384B",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
