"use client";

import Link from "next/link";
import { useState } from "react";
import { resolvePrediction, type ResolveResult } from "./actions";

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
      <section className="mt-6">
        <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          {result.isVoid ? (
            <p className="text-sm text-zinc-500">Voided — excluded from your score.</p>
          ) : (
            <>
              <p className="text-3xl font-semibold tabular-nums">{result.brier?.toFixed(2)}</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{result.sentence}</p>
              {result.runningBrier !== null && (
                <p className="mt-2 text-xs text-zinc-500">
                  Running Brier: {result.runningBrier.toFixed(2)}
                </p>
              )}
            </>
          )}
        </div>

        {result.canPostmortem && (
          <div className="mt-4 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Post-mortem</h2>
            {pmState === "streaming" && postmortem === "" ? (
              <p className="mt-2 text-zinc-400">Analyzing…</p>
            ) : pmState === "error" ? (
              <p className="mt-2 text-zinc-400">AI analysis unavailable right now.</p>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{postmortem}</p>
            )}
          </div>
        )}

        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
        >
          Back to dashboard
        </Link>
      </section>
    );
  }

  // --- error (e.g. already resolved elsewhere) ------------------------------
  if (result && !result.ok) {
    return (
      <section className="mt-6 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <p className="text-zinc-600 dark:text-zinc-400">
          {result.error === "already_resolved"
            ? "This prediction was already resolved."
            : "Something went wrong resolving this prediction."}
        </p>
        <Link href="/dashboard" className="mt-3 inline-block text-zinc-500 hover:underline">
          ← Back to dashboard
        </Link>
      </section>
    );
  }

  // --- open: the resolution controls ----------------------------------------
  return (
    <section className="mt-6">
      <p className="text-sm font-medium">What happened?</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("yes")}
          className="flex-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Yes
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("no")}
          className="flex-1 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
        >
          No
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => choose("void")}
          className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Void
        </button>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-zinc-500">What actually happened? (optional)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          maxLength={280}
          placeholder="The permit came back two weeks late."
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
    </section>
  );
}
