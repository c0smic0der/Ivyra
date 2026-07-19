"use client";

import { useEffect } from "react";

// Registers the PWA service worker on the client after mount.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          // Registration failures are non-fatal for the app.
        });
    }
  }, []);

  return null;
}
