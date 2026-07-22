"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { markOnboarded } from "@/lib/onboarding/storage";
import type { OnboardingTemplate } from "@/lib/onboarding/templates";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";

export function OnboardingFlow({ templates }: { templates: OnboardingTemplate[] }) {
  const router = useRouter();
  const [screen, setScreen] = useState<1 | 2>(1);

  function finish(destination: string) {
    markOnboarded();
    router.push(destination);
  }

  if (screen === 1) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Here&apos;s the idea</h1>
        <div className="mt-4 flex flex-col gap-3 text-sm text-ink-secondary">
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

        <Card className="mt-6">
          <CardLabel>For example</CardLabel>
          <p className="mt-2 text-sm text-ink-secondary">
            You write: &quot;80% sure I&apos;ll finish this by Friday.&quot; Friday comes and
            you&apos;re still not done — that one gets marked NO. Repeat that a few dozen times,
            and your calibration curve reveals whether your &quot;80% sure&quot; calls actually
            come true 80% of the time — or if you&apos;re consistently overconfident.
          </p>
        </Card>

        <button
          type="button"
          onClick={() => setScreen(2)}
          className={buttonVariants("primary", { className: "mt-6 w-full" })}
        >
          Next
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Make your first prediction</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Pick one to get started — you&apos;ll be able to edit it before saving.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {templates.map((template) => (
          <button
            key={template.key}
            type="button"
            onClick={() => finish(`/predictions/new?template=${template.key}`)}
            className="rounded-xl border border-border p-4 text-left transition-colors hover:bg-surface"
          >
            <span className="block text-xs font-medium uppercase tracking-wide text-ink-tertiary">
              {template.label}
            </span>
            <span className="mt-1 block text-sm text-ink">{template.text}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => finish("/dashboard")}
        className={buttonVariants("ghost", { className: "mt-6 block" })}
      >
        Skip — I&apos;ll write my own
      </button>
    </div>
  );
}
