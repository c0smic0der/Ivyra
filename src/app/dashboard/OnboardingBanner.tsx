"use client";

import { useState } from "react";
import Link from "next/link";

// A quiet pointer to the /how-it-works explainer for brand-new users. Shown only
// while the account has zero predictions — the caller passes `hasAnyPrediction`
// derived from the existing dashboard query, so this needs no localStorage and
// no state of its own beyond the page-view dismiss: once the first prediction
// exists, `hasAnyPrediction` flips true and the banner stops rendering for good.
export function OnboardingBanner({ hasAnyPrediction }: { hasAnyPrediction: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  if (hasAnyPrediction || dismissed) return null;

  return (
    <div className="mt-6 flex items-start justify-between gap-4 rounded-xl border border-accent/20 bg-accent-tint p-4">
      <div className="text-sm">
        <p className="text-ink">
          New here?{" "}
          <Link href="/how-it-works" className="font-medium text-accent hover:underline">
            See how Calra measures your judgment →
          </Link>
        </p>
        <Link
          href="/predictions/new"
          className="mt-1.5 inline-block text-xs text-ink-secondary hover:underline"
        >
          Or log your first prediction
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md px-1.5 text-lg leading-none text-ink-tertiary transition-colors hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
