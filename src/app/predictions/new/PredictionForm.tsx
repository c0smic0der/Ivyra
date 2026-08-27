"use client";

import { useActionState, useEffect, useState } from "react";
import { createPrediction, type CreatePredictionState } from "./actions";
import { TrackRecordPanel } from "./TrackRecordPanel";
import { useTrackRecordPanel } from "./useTrackRecordPanel";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";
import { kindFor } from "@/lib/predictions/kind";
import { takeQuickDraft } from "@/lib/onboarding/quickCaptureDraft";

const PLACEHOLDER_EXAMPLES = [
  "The kitchen reno finishes by Aug 15",
  "I go to the gym 12+ times in March",
  "Our team ships the redesign before the end of the quarter",
];

const initialState: CreatePredictionState = {};

interface PredictionFormProps {
  initialText?: string;
  initialKind?: "self" | "world";
  initialConfidence?: number;
}

export function PredictionForm({
  initialText = "",
  initialKind = "self",
  initialConfidence = 70,
}: PredictionFormProps) {
  const [state, formAction, pending] = useActionState(createPrediction, initialState);
  const [predictionKind, setPredictionKind] = useState<"self" | "world">(initialKind);
  // The two above-the-fold fields (docs/06-decision-layer.md §2.1). `criterion`
  // auto-mirrors `decisionOrClaim` while `mirrored` is true; a direct edit to
  // `criterion` breaks the link permanently for this entry. Editing `decisionOrClaim`
  // never breaks it — that's the mechanism that drives the mirror in the first place,
  // which is what lets a plain forecast take only one field's worth of typing.
  const [decisionOrClaim, setDecisionOrClaim] = useState(initialText);
  const [criterion, setCriterion] = useState(initialText);
  const [mirrored, setMirrored] = useState(true);
  const [confidence, setConfidence] = useState(initialConfidence);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  // Today (UTC) is the earliest allowed resolution date — same-day predictions
  // are permitted; the server enforces the same >= today rule (validation.ts).
  const [minResolutionDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Matched against the user's resolved history — `criterion` is always the
  // scoreable claim, whether or not this entry ends up a decision.
  const { result: trackRecordResult } = useTrackRecordPanel(criterion);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Pick up a draft handed off from the dashboard quick-capture box via
  // sessionStorage (never the URL). Only when the form isn't already prefilled by
  // a template or explicit initial text. One-shot: takeQuickDraft clears it. Seeds
  // both fields (mirror stays engaged) so a quick-capture draft still collapses to
  // a pure forecast unless the user goes on to edit the criterion.
  useEffect(() => {
    if (initialText) return;
    const stashed = takeQuickDraft(sessionStorage);
    if (stashed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only seed on mount
      setDecisionOrClaim(stashed);
      setCriterion(stashed);
    }
  }, [initialText]);

  function handleDecisionOrClaimChange(value: string) {
    setDecisionOrClaim(value);
    if (mirrored) setCriterion(value);
  }

  function handleCriterionChange(value: string) {
    setCriterion(value);
    setMirrored(false);
  }

  // Live-updates as decisionOrClaim fills or clears — independent of whether this
  // will actually collapse to a null-decision forecast at save time (that's decided
  // server-side by deriveDecisionAndText). Reuses kindFor, never reimplements the
  // rule (CLAUDE.md: one MUST derive from the other).
  const effectiveKind = kindFor({
    decision: decisionOrClaim.trim() === "" ? null : decisionOrClaim,
    predictionKind,
  });
  const secondReasoningLabel =
    effectiveKind === "self" ? "What's your plan?" : "What would change your mind?";
  const secondReasoningPlaceholder =
    effectiveKind === "self"
      ? "I'll block out two hours every weekday morning to work on it."
      : "If the contractor tells me the permit was denied, I'd drop my confidence a lot.";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label htmlFor="decisionOrClaim" className="block text-sm font-medium text-ink">
          What are you deciding, or what do you expect?
        </label>
        <p className="mt-1 text-sm text-ink-secondary">
          A choice you&apos;re making, or a call about how something goes.
        </p>
        <textarea
          id="decisionOrClaim"
          name="decisionOrClaim"
          required
          rows={3}
          value={decisionOrClaim}
          onChange={(e) => handleDecisionOrClaimChange(e.target.value)}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
          className={inputClasses("mt-2")}
        />
        {state.fieldErrors?.decisionOrClaim && (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.decisionOrClaim[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="criterion" className="block text-sm font-medium text-ink">
          How will you know it went well?
        </label>
        <p className="mt-1 text-sm text-ink-secondary">
          Something you can answer yes or no to later.
        </p>
        <textarea
          id="criterion"
          name="criterion"
          required
          rows={3}
          value={criterion}
          onChange={(e) => handleCriterionChange(e.target.value)}
          placeholder="Mirrors what you wrote above until you change it."
          className={inputClasses("mt-2")}
        />
        {state.fieldErrors?.criterion && (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.criterion[0]}</p>
        )}
        <details className="mt-2 text-sm text-ink-secondary">
          <summary className="cursor-pointer">What makes a good prediction?</summary>
          <ul className="mt-2 list-disc pl-5">
            <li>Be specific — name a date, number, or outcome that&apos;s unambiguous later.</li>
            <li>Make it falsifiable — you should be able to say YES or NO when it resolves.</li>
            <li>Keep the timeframe short enough that you&apos;ll actually find out.</li>
          </ul>
        </details>
      </div>

      <TrackRecordPanel result={trackRecordResult} confidencePercent={confidence} />

      <div>
        <label htmlFor="confidencePercent" className="block text-sm font-medium text-ink">
          Confidence: <span className="tabular-nums">{confidence}%</span>
        </label>
        <input
          id="confidencePercent"
          name="confidencePercent"
          type="range"
          min={1}
          max={99}
          step={1}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="mt-2 w-full accent-accent"
        />
        {state.fieldErrors?.confidencePercent && (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.confidencePercent[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="resolutionDate" className="block text-sm font-medium text-ink">
          Resolution date
        </label>
        <input
          id="resolutionDate"
          name="resolutionDate"
          type="date"
          required
          min={minResolutionDate}
          className={inputClasses("mt-1")}
        />
        {state.fieldErrors?.resolutionDate && (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.resolutionDate[0]}</p>
        )}
      </div>

      {/* Above this line: savable alone (docs/06-decision-layer.md §2.1). Below:
          optional, never gating. */}
      <hr className="border-t border-border" />

      <div>
        <span className="block text-sm font-medium text-ink">This prediction is about</span>
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => setPredictionKind("self")}
            className={cx(
              "rounded-xl border px-3 py-1.5 text-sm transition-colors",
              predictionKind === "self"
                ? "border-accent bg-accent text-white"
                : "border-border text-ink-secondary hover:bg-surface",
            )}
          >
            Myself
          </button>
          <button
            type="button"
            onClick={() => setPredictionKind("world")}
            className={cx(
              "rounded-xl border px-3 py-1.5 text-sm transition-colors",
              predictionKind === "world"
                ? "border-accent bg-accent text-white"
                : "border-border text-ink-secondary hover:bg-surface",
            )}
          >
            The world
          </button>
        </div>
        <input type="hidden" name="predictionKind" value={predictionKind} />
      </div>

      <div>
        <label htmlFor="reasoning" className="block text-sm font-medium text-ink">
          Why do you think so? <span className="text-ink-tertiary">(optional)</span>
        </label>
        <p className="mt-1 text-sm text-ink-secondary">
          Write as much as you want. This is the part you&apos;ll read back.
        </p>
        <textarea
          id="reasoning"
          name="reasoning"
          placeholder="They've been circling this for weeks and keep saying it's coming. I think they're just hedging and it'll land. Though I notice I want this to be true, so maybe I'm giving that more weight than I should…"
          className={inputClasses("mt-2 min-h-[130px]")}
        />
        <p className="mt-1 text-xs text-ink-tertiary">Locks when you save.</p>
      </div>

      <div>
        <label htmlFor="planOrDisconfirm" className="block text-sm font-medium text-ink">
          {secondReasoningLabel} <span className="text-ink-tertiary">(optional)</span>
        </label>
        <textarea
          id="planOrDisconfirm"
          name="planOrDisconfirm"
          rows={2}
          placeholder={secondReasoningPlaceholder}
          className={inputClasses("mt-1")}
        />
      </div>

      {state.formError && <p className="text-sm text-danger">{state.formError}</p>}

      <button
        type="submit"
        disabled={pending}
        className={buttonVariants("primary", { className: "disabled:opacity-50" })}
      >
        {pending ? "Saving…" : "Save prediction"}
      </button>
    </form>
  );
}
