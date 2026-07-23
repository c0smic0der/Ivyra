"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

// Hands-on scoring demo. The user drags a confidence, and we show — live — the
// exact score for BOTH possible outcomes, so the asymmetry that punishes
// confident-and-wrong is visible rather than described. Pure arithmetic, the
// same (p − outcome)² the real engine uses; no AI, nothing hidden.

function brier(confidencePct: number, outcome: 0 | 1): number {
  const p = confidencePct / 100;
  return (p - outcome) ** 2;
}

// 0 = perfect, 0.25 = coin-flip shrug, 1 = as wrong as possible. Map onto a
// three-stop scale so the number carries a color the way golf-score-low-is-good
// isn't obvious to a newcomer.
function toneFor(score: number): { label: string; className: string } {
  if (score <= 0.1) return { label: "Excellent", className: "text-success" };
  if (score <= 0.25) return { label: "Okay", className: "text-ink-secondary" };
  return { label: "Costly", className: "text-danger" };
}

function Outcome({
  heading,
  sub,
  confidence,
  outcome,
}: {
  heading: string;
  sub: string;
  confidence: number;
  outcome: 0 | 1;
}) {
  const score = brier(confidence, outcome);
  const distance = Math.abs(confidence / 100 - outcome);
  const tone = toneFor(score);
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm font-medium text-ink">{heading}</p>
      <p className="mt-0.5 text-xs text-ink-tertiary">{sub}</p>
      <p className="mt-4 font-mono text-3xl tabular-nums text-ink">{score.toFixed(2)}</p>
      <p className={cx("mt-1 text-xs font-medium", tone.className)}>{tone.label}</p>
      <p className="mt-3 text-xs text-ink-secondary">
        You were <span className="font-medium text-ink">{distance.toFixed(2)}</span> away from what
        happened.
      </p>
    </div>
  );
}

export function ScoreDemo() {
  const [confidence, setConfidence] = useState(70);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor="score-demo-confidence" className="text-sm font-medium text-ink">
          Your confidence
        </label>
        <span className="font-mono text-2xl tabular-nums text-accent">{confidence}%</span>
      </div>

      <input
        id="score-demo-confidence"
        type="range"
        min={1}
        max={99}
        value={confidence}
        onChange={(e) => setConfidence(Number(e.target.value))}
        className="mt-3 w-full accent-accent"
        aria-describedby="score-demo-help"
      />
      <p id="score-demo-help" className="mt-2 text-xs text-ink-tertiary">
        Drag to change how sure you are, then compare the two outcomes below. Lower is better — think
        of it like golf.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Outcome
          heading="If it happens"
          sub="Outcome: YES"
          confidence={confidence}
          outcome={1}
        />
        <Outcome
          heading="If it doesn't"
          sub="Outcome: NO"
          confidence={confidence}
          outcome={0}
        />
      </div>

      <p className="mt-5 text-sm text-ink-secondary">
        Notice what happens as you push toward the extremes: being{" "}
        <span className="font-medium text-ink">confident and right</span> earns a tiny score, but
        being <span className="font-medium text-ink">confident and wrong</span> is punished far
        harder than a cautious guess ever is. Sitting at{" "}
        <button
          type="button"
          onClick={() => setConfidence(50)}
          className="font-medium text-accent underline underline-offset-2"
        >
          50%
        </button>{" "}
        scores exactly <span className="font-mono text-ink">0.25</span> either way — the
        &ldquo;I&rsquo;m just shrugging&rdquo; baseline. Beating that number, over many predictions,
        means your confidence actually carries information.
      </p>
    </div>
  );
}
