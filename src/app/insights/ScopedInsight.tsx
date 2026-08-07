"use client";

import { useMemo, useState, useTransition } from "react";
import { cx } from "@/components/ui/cx";
import type { InsightCardModel, CategoryMenuItem } from "@/lib/insights/scopedInsightView";
import { CATEGORY_GATE_TOOLTIP } from "@/lib/insights/scopedInsightView";
import { generateInsight } from "./actions";

const OVER_CAP_MESSAGE = "You've hit today's AI limit — showing the latest saved insight. Try regenerating tomorrow.";
const AI_FAILED_MESSAGE = "Couldn't generate an insight right now — showing the templated summary below.";
const CATEGORY_TOOLTIP_ID = "category-gate-tooltip";

/** The short scope descriptor in the overline — "Last 20", "All 47", "Work · 12". */
function scopeDescriptor(card: InsightCardModel): string {
  if (card.kind === "recent") return `Last ${card.currentN}`;
  if (card.kind === "lifetime") return `All ${card.currentN}`;
  return `${card.toggleLabel} · ${card.currentN}`;
}

/** An accessible info affordance: keyboard-focusable, screen-reader described, shown on hover AND focus. */
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="About category insights"
        aria-describedby={CATEGORY_TOOLTIP_ID}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-ink-tertiary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        i
      </button>
      <span
        role="tooltip"
        id={CATEGORY_TOOLTIP_ID}
        className="pointer-events-none absolute right-0 top-full z-10 mt-1.5 w-60 rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs text-ink-secondary opacity-0 shadow-[var(--shadow-card)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/**
 * The coach's note — the scoped AI insight rendered as a blockquote, the only
 * accent-bordered element on the page. The numbers, profile, freshness, and
 * per-scope gating are all decided server-side; this owns the scope selector and
 * the on-demand Generate/Regenerate action. It never auto-generates: a stale or
 * absent insight waits for an explicit click, so a page load can never silently
 * burn the daily cap.
 */
export function ScopedInsight({
  cards,
  categoryMenu,
}: {
  cards: InsightCardModel[];
  categoryMenu: CategoryMenuItem[];
}) {
  const [scope, setScope] = useState<string>("recent");
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const primary = cards.filter((c) => c.kind === "recent" || c.kind === "lifetime");
  const card = cards.find((c) => c.scope === scope) ?? cards[0]!;

  const anyCategoryUnlocked = categoryMenu.some((m) => m.unlocked);
  // The select shows a category only when one is currently chosen; otherwise the placeholder.
  const selectValue = categoryMenu.some((m) => m.scope === scope) ? scope : "";

  const showCached = card.cachedText !== null;
  const bodyText = showCached ? card.cachedText! : card.fallbackText;
  // Split the body into paragraphs so the first stands alone and the rest sit
  // behind "Read the full analysis". Reset the expander whenever the text changes.
  const paragraphs = useMemo(() => bodyText.split(/\n\n+/).filter((p) => p.trim().length > 0), [bodyText]);
  const hasMore = paragraphs.length > 1;
  const actionLabel = card.freshness === "absent" ? "Generate insight" : "Regenerate";

  function switchScope(next: string) {
    setError(null);
    setExpanded(false);
    setScope(next);
  }

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateInsight({ scope: card.scope });
      // On success revalidatePath re-renders the server component and the fresh
      // text arrives as new props; we only surface the failure branches here.
      if (!res.ok) {
        setError(res.error === "over_cap" ? OVER_CAP_MESSAGE : AI_FAILED_MESSAGE);
      }
    });
  }

  return (
    <section aria-label="AI insight" className="border-l-2 border-accent pl-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-tertiary">
          This week’s read · {scopeDescriptor(card)}
        </p>

        {/* Controls, minimal, to the right of the overline. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Insight scope">
            {primary.map((c) => (
              <button
                key={c.scope}
                type="button"
                role="tab"
                aria-selected={scope === c.scope}
                onClick={() => switchScope(c.scope)}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  scope === c.scope ? "bg-accent text-white" : "text-ink-secondary hover:text-ink",
                )}
              >
                {c.toggleLabel}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor="category-scope">
              Category
            </label>
            <select
              id="category-scope"
              value={selectValue}
              disabled={!anyCategoryUnlocked}
              onChange={(e) => e.target.value && switchScope(e.target.value)}
              className={cx(
                "rounded-lg border border-border bg-canvas px-2.5 py-1 text-xs font-medium transition-colors",
                anyCategoryUnlocked ? "text-ink" : "cursor-not-allowed text-ink-tertiary",
                selectValue ? "ring-1 ring-accent" : "",
              )}
            >
              <option value="">Category…</option>
              {categoryMenu.map((m) => (
                <option key={m.scope} value={m.scope} disabled={!m.unlocked}>
                  {m.label}
                </option>
              ))}
            </select>
            <InfoTooltip text={CATEGORY_GATE_TOOLTIP} />
          </div>
        </div>
      </div>

      {/* Stale: an out-of-date badge naming WHY (new data, or an improved prompt). */}
      {card.freshness === "stale" && card.staleMessage && (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-xs text-ink-secondary">
          {card.staleMessage}
        </p>
      )}

      {card.insufficientData ? (
        <p className="mt-3 text-sm text-ink-secondary">{card.insufficientReason}</p>
      ) : (
        <>
          <blockquote className="mt-4 font-serif text-lg leading-relaxed text-ink">
            <p>{paragraphs[0]}</p>
            {expanded &&
              paragraphs.slice(1).map((para, i) => (
                <p key={i} className="mt-3">
                  {para}
                </p>
              ))}
          </blockquote>

          {hasMore && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-2 text-sm font-medium text-accent hover:underline"
            >
              {expanded ? "Show less" : "Read the full analysis"}
            </button>
          )}

          {/* Fresh: explain there's nothing to regenerate as a data limit, not a bug. */}
          {card.freshness === "fresh" && card.currentStatusLine && (
            <p className="mt-3 text-xs text-ink-tertiary">{card.currentStatusLine}</p>
          )}
          {/* Absent: the shown line is the templated fallback until they generate. */}
          {card.freshness === "absent" && (
            <p className="mt-3 text-xs text-ink-tertiary">
              The line above is a templated summary. Generate an AI insight to name the reasoning pattern and its
              fix.
            </p>
          )}
        </>
      )}

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}

      {/* The action appears only when there's a reason to spend a call — absent
          (Generate) or stale (Regenerate). A fresh insight shows its status line
          instead. Over cap, the button is present but disabled with an honest
          message; the server enforces the cap regardless of this button. */}
      {!card.insufficientData && card.freshness !== "fresh" && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onGenerate}
            disabled={pending || !card.canGenerate}
            className={cx(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              pending || !card.canGenerate
                ? "cursor-not-allowed bg-surface text-ink-tertiary"
                : "bg-accent text-white hover:opacity-90",
            )}
          >
            {pending ? "Generating…" : actionLabel}
          </button>
          {card.overCap && <span className="text-xs text-ink-tertiary">{OVER_CAP_MESSAGE}</span>}
        </div>
      )}
    </section>
  );
}
