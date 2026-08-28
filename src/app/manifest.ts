import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (Next.js generates the route from this file).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ivyra",
    short_name: "Ivyra",
    description: "A decision journal that scores your expectations against real outcomes.",
    start_url: "/dashboard",
    // PWA installability is shelved (see docs/04 §6). "browser" de-lists the app
    // from install prompts; the icons array is intentionally omitted so no
    // installable icon set is advertised. The tab/bookmark favicon and apple-icon
    // (src/app/) are unaffected — those are separate from installability.
    // Re-enable = display "standalone" + restore the icons array (assets remain
    // in public/icon-192.png and public/icon-512.png).
    display: "browser",
    background_color: "#ffffff",
    // Mirrors --color-accent in globals.css (a static manifest can't read the CSS var).
    theme_color: "#4f46e5",
  };
}
