"use client";

import { useActionState, useEffect, useState } from "react";
import { createPrediction, type CreatePredictionState } from "./actions";
import { TrackRecordPanel } from "./TrackRecordPanel";
import { useTrackRecordPanel } from "./useTrackRecordPanel";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { kindFor } from "@/lib/predictions/kind";
import { takeQuickDraft } from "@/lib/onboarding/quickCaptureDraft";

const PLACEHOLDER_EXAMPLES = [
  "I turn down the contract",
  "I move to Denver this fall",
  "I take the new role instead of staying put",
];

const initialState: CreatePredictionState = {};

interface PredictionFormProps {
  initialText?: string;
  initialConfidence?: number;
}

export function PredictionForm({ initialText = "", initialConfidence = 70 }: PredictionFormProps) {
  const [state, formAction, pending] = useActionState(createPrediction, initialState);
  // The two above-the-fold fields (docs/06-decision-layer.md §2.1), both required and
  // independent — no mirroring, no default text. Every new entry is a decision:
  // `decision` persists the first field verbatim, `criterion` persists to `text`, the
  // scoreable claim.
  const [decision, setDecision] = useState(initialText);
  const [criterion, setCriterion] = useState("");
  const [confidence, setConfidence] = useState(initialConfidence);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  // Today (UTC) is the earliest allowed resolution date — same-day predictions
  // are permitted; the server enforces the same >= today rule (validation.ts).
  const [minResolutionDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Matched against the user's resolved history — `criterion` is always the
  // scoreable claim.
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
  // only the decision field — the criterion is always the user's own words, never
  // defaulted.
  useEffect(() => {
    if (initialText) return;
    const stashed = takeQuickDraft(sessionStorage);
    if (stashed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only seed on mount
      setDecision(stashed);
    }
  }, [initialText]);

  // Every new entry is a decision (docs/06-decision-layer.md §2.1): `decision` is
  // always a defined string (even "" before the user types), so kindFor always
  // resolves 'self' here — reused, never reimplemented (CLAUDE.md: one MUST derive
  // from the other). The world branch stays alive in kind.ts for legacy rows.
  const kind = kindFor({ decision, predictionKind: "self" });
  const secondReasoningLabel = kind === "self" ? "What's your plan?" : "What would change your mind?";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label htmlFor="decision" className="block text-sm font-medium text-ink">
          What are you deciding?
        </label>
        <p className="mt-1 text-sm text-ink-secondary">
          A choice you&apos;re making, or a call about how something goes.
        </p>
        <textarea
          id="decision"
          name="decision"
          required
          rows={3}
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
          className={inputClasses("mt-2")}
        />
        {state.fieldErrors?.decision && (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.decision[0]}</p>
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
          onChange={(e) => setCriterion(e.target.value)}
          placeholder="They come back with a full-time offer by end of September"
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
          placeholder="I'll block out two hours every weekday morning to work on it."
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
