"use client";

import { useActionState, useEffect, useState } from "react";
import { createPrediction, type CreatePredictionState } from "./actions";
import { TrackRecordPanel } from "./TrackRecordPanel";
import { useTrackRecordPanel } from "./useTrackRecordPanel";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";

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
  const [text, setText] = useState(initialText);
  const [confidence, setConfidence] = useState(initialConfidence);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [minResolutionDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const { result: trackRecordResult } = useTrackRecordPanel(text);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const secondReasoningLabel =
    predictionKind === "self" ? "What's your plan?" : "What would change your mind?";
  const secondReasoningPlaceholder =
    predictionKind === "self"
      ? "I'll block out two hours every weekday morning to work on it."
      : "If the contractor tells me the permit was denied, I'd drop my confidence a lot.";

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div>
        <label htmlFor="text" className="block text-sm font-medium text-ink">
          What do you think will happen?
        </label>
        <textarea
          id="text"
          name="text"
          required
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
          className={inputClasses("mt-1")}
        />
        {state.fieldErrors?.text && (
          <p className="mt-1 text-sm text-danger">{state.fieldErrors.text[0]}</p>
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

      <TrackRecordPanel result={trackRecordResult} />

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
        <textarea
          id="reasoning"
          name="reasoning"
          rows={2}
          placeholder="The contractor confirmed the schedule last week."
          className={inputClasses("mt-1")}
        />
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
