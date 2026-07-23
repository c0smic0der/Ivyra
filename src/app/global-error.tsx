"use client"; // Error boundaries must be Client Components.

import "./globals.css";

// Last-resort boundary: catches errors thrown by the ROOT layout itself, which
// the segment-level error.tsx cannot wrap. It replaces the root layout, so it
// must render its own <html>/<body> and import global styles. Same tone as
// error.tsx; no message rendered (may carry internals). Rare by construction.
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl border border-border bg-canvas p-6 text-center shadow-[var(--shadow-card)]">
            <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-secondary">
              The app hit an unexpected error. Try reloading — it&rsquo;s usually temporary.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
