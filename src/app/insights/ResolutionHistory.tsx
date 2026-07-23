"use client";

import Link from "next/link";
import { useState } from "react";
import {
  EMPTY_FILTERS,
  filterHistory,
  hasManualFilters,
  type HistoryItem,
  type HistorySort,
  type OutcomeFilter,
  paginate,
  sortHistory,
  type SortDir,
} from "@/lib/insights/historyView";
import { brierSentence } from "@/lib/scoring";
import { Card } from "@/components/ui/Card";
import { inputClasses } from "@/components/ui/input";
import { useInsightsSelection } from "./InsightsSelection";

const SORT_LABELS: Record<HistorySort, string> = {
  date: "Date",
  confidence: "Confidence",
  score: "Score",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function OutcomeBadge({ status, outcome }: { status: string; outcome: boolean | null }) {
  const base = "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  if (status === "void") return <span className={`${base} bg-surface text-ink-tertiary`}>Void</span>;
  return outcome ? (
    <span className={`${base} bg-success/10 text-success`}>Yes</span>
  ) : (
    <span className={`${base} bg-danger/10 text-danger`}>No</span>
  );
}

export function ResolutionHistory({
  items,
  categories,
}: {
  items: HistoryItem[];
  categories: readonly string[];
}) {
  const { selection, setSelection } = useInsightsSelection();

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [sort, setSort] = useState<HistorySort>("date");
  const [dir, setDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);

  const manual = { q, category, outcome, from, to };
  // Any change of filter or chart selection returns to page 1 so the user never
  // lands on a now-empty page. Done by comparing a filter signature against the
  // previous render (React's sanctioned "adjust state during render" pattern)
  // rather than an effect, which avoids a cascading re-render.
  const filterKey = `${q}|${category}|${outcome}|${from}|${to}|${selection?.label ?? ""}`;
  const [prevKey, setPrevKey] = useState(filterKey);
  if (filterKey !== prevKey) {
    setPrevKey(filterKey);
    setPage(1);
  }

  const filtered = filterHistory(items, { ...manual, selectionIds: selection?.ids ?? null });
  const sorted = sortHistory(filtered, sort, dir);
  const { pageItems, page: safePage, total, totalPages } = paginate(sorted, page);
  const rangeStart = total === 0 ? 0 : (safePage - 1) * 20 + 1;
  const rangeEnd = Math.min(safePage * 20, total);

  function toggleSort(column: HistorySort) {
    if (sort === column) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir(column === "score" ? "asc" : "desc"); // best Brier first; newest/boldest first otherwise
    }
  }

  function clearManualFilters() {
    setQ(EMPTY_FILTERS.q);
    setCategory(EMPTY_FILTERS.category);
    setOutcome(EMPTY_FILTERS.outcome);
    setFrom(EMPTY_FILTERS.from);
    setTo(EMPTY_FILTERS.to);
  }

  return (
    <section id="history" className="scroll-mt-6 lg:col-span-5">
      <h2 className="text-base font-semibold text-ink">Resolution history</h2>

      {/* Chart-selection chip — the live link from the progress chart. */}
      {selection && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-tint px-3 py-2 text-xs">
          <span className="text-ink">
            Showing <span className="font-medium">{selection.label}</span> from the progress chart
          </span>
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="shrink-0 font-medium text-accent hover:underline"
          >
            Clear ✕
          </button>
        </div>
      )}

      <Card as="div" className="mt-3">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your predictions…"
            className={inputClasses()}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
              Category
              <select
                value={category ?? ""}
                onChange={(e) => setCategory(e.target.value || null)}
                className={inputClasses("capitalize")}
              >
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
              Outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
                className={inputClasses()}
              >
                <option value="all">All</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="void">Void</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
              Resolved from
              <input
                type="date"
                value={from ?? ""}
                onChange={(e) => setFrom(e.target.value || null)}
                className={inputClasses()}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
              Resolved to
              <input
                type="date"
                value={to ?? ""}
                onChange={(e) => setTo(e.target.value || null)}
                className={inputClasses()}
              />
            </label>
          </div>
          {hasManualFilters({ ...manual, selectionIds: null }) && (
            <button
              type="button"
              onClick={clearManualFilters}
              className="self-start text-xs text-ink-tertiary hover:text-ink hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-tertiary">
          <span>Sort by</span>
          {(Object.keys(SORT_LABELS) as HistorySort[]).map((column) => {
            const active = sort === column;
            return (
              <button
                key={column}
                type="button"
                onClick={() => toggleSort(column)}
                aria-pressed={active}
                className={active ? "font-medium text-ink" : "hover:text-ink"}
              >
                {SORT_LABELS[column]}
                {active ? (dir === "asc" ? " ↑" : " ↓") : ""}
              </button>
            );
          })}
        </div>
        <span className="whitespace-nowrap text-xs text-ink-tertiary">
          {total === 0 ? "0 results" : `${rangeStart}–${rangeEnd} of ${total}`}
        </span>
      </div>

      {pageItems.length === 0 ? (
        <Card as="div" className="mt-3 border-dashed text-center text-sm text-ink-secondary">
          <p>No predictions match{selection ? " this selection" : " these filters"}.</p>
          <button
            type="button"
            onClick={() => {
              clearManualFilters();
              setSelection(null);
            }}
            className="mt-2 inline-block font-medium text-accent hover:underline"
          >
            Clear everything
          </button>
        </Card>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {pageItems.map((row) => (
            <li key={row.id}>
              <Link
                href={`/predictions/${row.id}/resolve`}
                className="block rounded-xl border border-border bg-canvas p-4 text-sm shadow-[var(--shadow-card)] transition-colors hover:border-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-ink">{row.text}</p>
                  <OutcomeBadge status={row.status} outcome={row.outcome} />
                </div>
                <p className="mt-1 text-xs text-ink-tertiary">
                  {Math.round(row.confidence * 100)}% confident
                  {row.category ? (
                    <> · <span className="capitalize">{row.category}</span></>
                  ) : null}
                  {" · resolved "}
                  {fmtDate(row.resolvedAt)}
                </p>
                <p className="mt-1 text-xs text-ink-tertiary">
                  {row.status === "void"
                    ? "Voided — excluded from your score."
                    : row.brier !== null
                      ? brierSentence(row.brier)
                      : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="History pagination">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="text-accent hover:underline disabled:cursor-not-allowed disabled:text-ink-tertiary disabled:no-underline"
          >
            ← Previous
          </button>
          <span className="text-xs text-ink-tertiary">
            Page {safePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="text-accent hover:underline disabled:cursor-not-allowed disabled:text-ink-tertiary disabled:no-underline"
          >
            Next →
          </button>
        </nav>
      )}
    </section>
  );
}
