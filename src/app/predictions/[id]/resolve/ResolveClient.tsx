"use client";

import Link from "next/link";
import { useState } from "react";
import { resolvePrediction, type ResolveResult } from "./actions";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";

type PostmortemState = "idle" | "streaming" | "done" | "error";

export function ResolveClient({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResolveResult | null>(null);
  const [postmortem, setPostmortem] = useState("");
  const [pmState, setPmState] = useState<PostmortemState>("idle");

  async function choose(choice: "yes" | "no" | "void") {
    setPending(true);
    const res = await resolvePrediction({ id, choice, outcomeNote: note });
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
              <p className="text-4xl font-semibold tabular-nums text-ink">
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
            <CardLabel>Post-mortem</CardLabel>
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
  return (
    <section className="mt-8">
      <p className="text-sm font-medium text-ink">What happened?</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("yes")}
          className="flex-1 rounded-xl bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("no")}
          className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          No
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("void")}
          className={buttonVariants("secondary", { className: "flex-1 disabled:opacity-50" })}
        >
          Void
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-ink-secondary">What actually happened? (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          maxLength={280}
          placeholder="The permit came back two weeks late."
          className={inputClasses("mt-1")}
        />
      </label>
    </section>
  );
}
