import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (Next.js generates the route from this file).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ivyra",
    short_name: "Ivyra",
    description:
      "Log real-life predictions, resolve them, and score your calibration over time.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    // Mirrors --color-accent in globals.css (a static manifest can't read the CSS var).
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
