"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";

// Route-segment error boundary. A friendly fallback for any uncaught throw in a
// page or its children (e.g. a Drizzle read failing) — the user never sees a
// stack trace. We deliberately do NOT render `error.message`: Server Component
// errors arrive as a generic string with a `digest`, and even client messages
// can carry internals. `unstable_retry` (Next 16.2+) re-fetches and re-renders
// the segment, which is the right recovery for a transient DB/network blip.
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Log the error class only — never the message/object, which can echo
    // prediction content or other internals (CLAUDE.md: nothing sensitive in logs).
    console.error("route error", error.name, error.digest ?? "");
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-xl font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          We hit a snag loading this page. This is usually temporary — try again in a moment.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button type="button" onClick={() => unstable_retry()} className={buttonVariants("primary", { size: "sm" })}>
            Try again
          </button>
          <Link href="/dashboard" className={buttonVariants("secondary", { size: "sm" })}>
            Back to dashboard
          </Link>
        </div>
      </Card>
    </main>
  );
}
