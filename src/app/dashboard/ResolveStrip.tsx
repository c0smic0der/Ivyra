"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

// The old dashboard's due-for-resolution list, reduced to one dismissible accent
// strip. It deep-links to the demoted resolve queue (/dashboard/queue) where the
// full due + open lists still live. Dismissal is remembered per count, so closing
// it stays closed for the session but a newly-due entry re-surfaces it.
const DISMISS_KEY = "journal:resolveStripDismissedAt";

// A tiny subscribe/notify store so the click handler can re-render subscribers
// without a setState-in-effect. sessionStorage is the source of truth; this only
// signals "it changed". Server + first hydration read the server snapshot (never
// dismissed), matching the markup, then the real value settles in (Session 17).
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify(): void {
  for (const l of listeners) l();
}

function useDismissedFor(count: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => Number(sessionStorage.getItem(DISMISS_KEY) ?? "0") === count,
    () => false,
  );
}

export function ResolveStrip({ count }: { count: number }) {
  const dismissed = useDismissedFor(count);
  if (count <= 0 || dismissed) return null;

  return (
    <div className="mt-6 flex items-center gap-2 rounded-xl border border-accent/25 bg-accent-tint px-4 py-3">
      <Link href="/dashboard/queue" className="group flex min-w-0 flex-1 items-center gap-2 text-sm">
        <span className="font-medium text-accent">{count} ready to resolve</span>
        <span aria-hidden className="text-accent transition-transform group-hover:translate-x-0.5">
          ›
        </span>
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, String(count));
          notify();
        }}
        className="shrink-0 rounded-md p-1 text-accent/70 transition-colors hover:bg-accent/10 hover:text-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
