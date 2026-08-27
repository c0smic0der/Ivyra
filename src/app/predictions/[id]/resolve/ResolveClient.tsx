"use client";

import Link from "next/link";
import { useState } from "react";
import { resolvePrediction, type ResolveResult } from "./actions";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { inputClasses } from "@/components/ui/input";
import { stanceValues, type Stance } from "@/lib/predictions/stance";

type PostmortemState = "idle" | "streaming" | "done" | "error";
type Verdict = "yes" | "no" | "void";

const STANCE_LABELS: Record<Stance, string> = {
  stand_by: "Stand by it",
  mixed: "Mixed",
  wouldnt_again: "Wouldn't again",
};

export function ResolveClient({ id, hasDecision }: { id: string; hasDecision: boolean }) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [note, setNote] = useState("");
  const [reflection, setReflection] = useState("");
  const [stance, setStance] = useState<Stance | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [postmortem, setPostmortem] = useState("");
  const [pmState, setPmState] = useState<PostmortemState>("idle");

  // The verdict is client-side state only — nothing persists until the CTA
  // fires this one Server Action, so the verdict, outcome note, reflection, and
  // stance are all written atomically.
  async function save() {
    if (verdict === null) return;
    setPending(true);
    const res = await resolvePrediction({
      id,
      choice: verdict,
      outcomeNote: note,
      reflection: hasDecision ? reflection : undefined,
      stance: hasDecision && stance !== null ? stance : undefined,
    });
    setResult(res);
    setPending(false);
    if (res.ok && res.canPostmortem) void streamPostmortem();
  }

  async function streamPostmortem() {
    setPmState("streaming");
    try {
      // Same-origin GET — cookies ride along so the route handler authenticates.
      const resp = await fetch(`/predictions/${id}/postmortem`, { method: "GET" });
      if (!resp.ok || !resp.body) {
        setPmState("error");
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        setPostmortem((prev) => prev + decoder.decode(value, { stream: true }));
      }
      setPmState("done");
    } catch {
      setPmState("error");
    }
  }

  // --- resolved: show the deterministic score, then stream the narrative -----
  if (result?.ok) {
    return (
      <section className="mt-8">
        <Card>
          {result.isVoid ? (
            <p className="text-sm text-ink-secondary">Voided — excluded from your score.</p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums text-ink">
                {result.brier?.toFixed(2)}
              </p>
              <p className="mt-1 text-sm text-ink-secondary">{result.sentence}</p>
              {result.runningBrier !== null && (
                <p className="mt-2 text-xs text-ink-tertiary">
                  Running Brier: {result.runningBrier.toFixed(2)}
                </p>
              )}
            </>
          )}
        </Card>

        {result.canPostmortem && (
          <Card className="mt-4">
            <CardLabel>Looking back</CardLabel>
            {pmState === "streaming" && postmortem === "" ? (
              <p className="mt-2 text-ink-tertiary">Analyzing…</p>
            ) : pmState === "error" ? (
              <p className="mt-2 text-ink-tertiary">AI analysis unavailable right now.</p>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink-secondary">{postmortem}</p>
            )}
          </Card>
        )}

        <Link href="/dashboard" className={buttonVariants("primary", { className: "mt-6 inline-flex" })}>
          Back to dashboard
        </Link>
      </section>
    );
  }

  // --- error (e.g. already resolved elsewhere) ------------------------------
  if (result && !result.ok) {
    return (
      <Card as="section" className="mt-8">
        <p className="text-sm text-ink-secondary">
          {result.error === "already_resolved"
            ? "This prediction was already resolved."
            : "Something went wrong resolving this prediction."}
        </p>
        <Link href="/dashboard" className={buttonVariants("ghost", { className: "mt-3 inline-block" })}>
          ← Back to dashboard
        </Link>
      </Card>
    );
  }

  // --- open: the resolution controls ----------------------------------------
  // Selection affordance only — the base color/label of each verdict button is
  // unchanged; a selected button rings, the others dim.
  const selectionClasses = (choice: Verdict) =>
    cx(
      verdict !== null && verdict !== choice && "opacity-40",
      verdict === choice && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
    );

  return (
    <section className="mt-8">
      <p className="text-sm font-medium text-ink">What happened?</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          aria-pressed={verdict === "yes"}
          onClick={() => setVerdict("yes")}
          className={cx(
            "flex-1 rounded-xl bg-success px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50",
            selectionClasses("yes"),
          )}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={verdict === "no"}
          onClick={() => setVerdict("no")}
          className={cx(
            "flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50",
            selectionClasses("no"),
          )}
        >
          No
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={verdict === "void"}
          onClick={() => setVerdict("void")}
          className={buttonVariants("secondary", {
            className: cx("flex-1 transition-all disabled:opacity-50", selectionClasses("void")),
          })}
        >
          Void
        </button>
      </div>

      <div className="mt-6">
        <label htmlFor="outcomeNote" className="block text-sm font-medium text-ink">
          How did it actually go?
        </label>
        <p className="mt-1 text-sm text-ink-secondary">As much or as little as you like.</p>
        <textarea
          id="outcomeNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          placeholder="The permit came back two weeks late."
          className={inputClasses("mt-2 min-h-[120px]")}
        />
      </div>

      {hasDecision && (
        <div className="mt-6">
          <label htmlFor="reflection" className="block text-sm font-medium text-ink">
            Knowing what you know now — was this the decision you wanted to have made?
          </label>
          <p className="mt-1 text-sm text-ink-secondary">As much or as little as you like.</p>
          <textarea
            id="reflection"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            disabled={pending}
            className={inputClasses("mt-2 min-h-[100px]")}
          />
          <div className="mt-3 flex gap-2">
            {stanceValues.map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                aria-pressed={stance === value}
                onClick={() => setStance((prev) => (prev === value ? null : value))}
                className={buttonVariants("secondary", {
                  className: cx(
                    "flex-1 transition-all disabled:opacity-50",
                    stance !== null && stance !== value && "opacity-40",
                    stance === value && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                  ),
                })}
              >
                {STANCE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={pending || verdict === null}
        onClick={() => void save()}
        className={buttonVariants("primary", { className: "mt-6 disabled:opacity-50" })}
      >
        {pending ? "Saving…" : verdict === "void" ? "Save" : "Save and see post-mortem"}
      </button>
    </section>
  );
}
