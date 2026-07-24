import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (Next.js generates the route from this file).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Aftercast",
    short_name: "Aftercast",
    description:
      "Log real-life predictions, resolve them, and score your calibration over time.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
