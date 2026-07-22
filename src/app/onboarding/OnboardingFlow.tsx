"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { isOnboarded, markOnboarded } from "@/lib/onboarding/storage";
import type { OnboardingTemplate } from "@/lib/onboarding/templates";

function subscribeNever() {
  return () => {};
}

// Treated as "onboarded" on the server (and the pre-hydration client render)
// so this never flashes screen 1 before the real localStorage value is known.
function getServerSnapshot() {
  return true;
}

export function OnboardingFlow({ templates }: { templates: OnboardingTemplate[] }) {
  const router = useRouter();
  const [screen, setScreen] = useState<1 | 2>(1);
  const onboarded = useSyncExternalStore(subscribeNever, isOnboarded, getServerSnapshot);

  useEffect(() => {
    if (onboarded) router.replace("/dashboard");
  }, [onboarded, router]);

  // Hidden until the real client value is known — never flashes screen 1 to
  // an already-onboarded user.
  if (onboarded) return null;

  function finish(destination: string) {
    markOnboarded();
    router.push(destination);
  }

  if (screen === 1) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Here&apos;s the idea</h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-zinc-600 dark:text-zinc-400">
          <p>Most of us think we have decent instincts — but we rarely check.</p>
          <p>
            Caliber has you write down predictions with a confidence level, then track what
            actually happens.
          </p>
          <p>
            Do that enough times, and it shows you exactly where your gut is right, and where
            it&apos;s fooling you.
          </p>
        </div>

        <div className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            For example
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            You write: &quot;80% sure I&apos;ll finish this by Friday.&quot; Friday comes and
            you&apos;re still not done — that one gets marked NO. Repeat that a few dozen times,
            and your calibration curve reveals whether your &quot;80% sure&quot; calls actually
            come true 80% of the time — or if you&apos;re consistently overconfident.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setScreen(2)}
          className="mt-6 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Make your first prediction</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Pick one to get started — you&apos;ll be able to edit it before saving.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {templates.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => finish(`/predictions/new?template=${template.key}`)}
            className="rounded-md border border-zinc-300 p-4 text-left hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <span className="block text-xs font-medium uppercase tracking-wide text-zinc-400">
              {template.label}
            </span>
            <span className="mt-1 block text-sm">{template.text}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => finish("/dashboard")}
        className="mt-6 block text-sm text-zinc-500 hover:underline"
      >
        Skip — I&apos;ll write my own
      </button>
    </div>
  );
}
