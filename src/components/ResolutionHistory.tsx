"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { fetchHistory } from "@/app/insights/historyActions";
import { useInsightsSelection } from "@/app/insights/InsightsSelection";
import {
  applyChartFilter,
  type CompactHistoryItem,
  EMPTY_PARAMS,
  type FullHistoryItem,
  type FullResult,
  hasManualFilters,
  HISTORY_CATEGORIES,
  type HistoryFullParams,
  type HistorySort,
  type OutcomeFilter,
  type SortDir,
} from "@/lib/insights/historyView";
import { brierSentence } from "@/lib/scoring";
import { Card } from "@/components/ui/Card";
import { inputClasses } from "@/components/ui/input";

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

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
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

// ---------------------------------------------------------------------------
// One shared component, one `mode` prop. Both modes render the SAME plain record
// (text / outcome / date). Full mode adds the score line, filters, sort, paging,
// and expand-in-place to the COMPLETE record — so a resolved prediction has no
// separate detail page to link out to. The data always comes from the one
// server-side, user-scoped query (compact via the page, full via the action).
// ---------------------------------------------------------------------------

export function ResolutionHistory(
  props:
    | { mode: "compact"; items: CompactHistoryItem[] }
    | { mode: "full"; initial: FullResult; focusId?: string | null; categories?: readonly string[] },
) {
  if (props.mode === "compact") return <CompactHistory items={props.items} />;
  return (
    <FullHistory
      initial={props.initial}
      focusId={props.focusId ?? null}
      categories={props.categories ?? HISTORY_CATEGORIES}
    />
  );
}

// --- compact (dashboard) ---------------------------------------------------

function CompactHistory({ items }: { items: CompactHistoryItem[] }) {
  return (
    <section aria-label="Recent resolutions">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Recent resolutions</h2>
        <Link href="/insights#history" className="text-sm font-medium text-accent hover:underline">
          View all →
        </Link>
      </div>

      {items.length === 0 ? (
        <Card as="div" className="mt-3 border-dashed text-center text-sm text-ink-secondary">
          <p>Nothing resolved yet — when a resolution date arrives, how it landed shows up here.</p>
        </Card>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((row) => (
            <li key={row.id}>
              {/* The full record lives on /insights; a compact row opens that card
                  (focused + expanded), never a per-resolution detail page. */}
              <Link
                href={`/insights?resolution=${row.id}#history`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas p-4 text-sm shadow-[var(--shadow-card)] transition-colors hover:border-accent/40"
              >
                <span className="min-w-0 text-ink">{row.text}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <OutcomeBadge status={row.status} outcome={row.outcome} />
                  <span className="whitespace-nowrap text-xs text-ink-tertiary">{fmtDate(row.resolvedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --- full (insights) -------------------------------------------------------

function FullHistory({
  initial,
  focusId,
  categories,
}: {
  initial: FullResult;
  focusId: string | null;
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
  const [expanded, setExpanded] = useState<string | null>(focusId);

  const [result, setResult] = useState<FullResult>(initial);
  const [pending, startTransition] = useTransition();

  // Arriving via /insights?resolution=<id> (e.g. from a dashboard glance or an
  // old detail-page URL): focus that one card by reusing the SAME chart-selection
  // mechanism a chart click uses. The id is only ever applied as a user-scoped
  // query filter, so a uuid that isn't the viewer's simply matches nothing —
  // nothing renders, scrolls, or highlights. Ownership is also checked server-side
  // before focusId is passed in.
  const focusAppliedRef = useRef(false);
  useEffect(() => {
    if (focusId && !focusAppliedRef.current) {
      focusAppliedRef.current = true;
      setSelection({ label: "this resolution", patch: { selectionIds: [focusId] } });
      setExpanded(focusId);
    }
  }, [focusId, setSelection]);

  // Reset to page 1 whenever a filter or the chart selection changes, so the user
  // never lands on a now-empty page. React's "adjust state during render" pattern.
  const filterKey = `${q}|${category}|${outcome}|${from}|${to}|${selection?.label ?? ""}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const params: HistoryFullParams = applyChartFilter(
    { ...EMPTY_PARAMS, q, category, outcome, from, to, sort, dir, page },
    selection,
  );

  // Fetch server-side on every effective-params change, debounced so typing in
  // the search box coalesces. The initial render already holds the server-rendered
  // default page, so we seed `lastKey` with it and skip that first round-trip.
  const paramsKey = JSON.stringify(params);
  const lastKeyRef = useRef(JSON.stringify(applyChartFilter({ ...EMPTY_PARAMS }, null)));

  useEffect(() => {
    if (paramsKey === lastKeyRef.current) return;
    const handle = setTimeout(() => {
      lastKeyRef.current = paramsKey;
      startTransition(async () => {
        const res = await fetchHistory(params);
        if (res.ok) setResult(res.result);
      });
    }, 250);
    return () => clearTimeout(handle);
    // params is fully captured by paramsKey; re-run only when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const { items, total, page: safePage, totalPages } = result;

  // Once the focused card is actually present (after its fetch resolves), scroll
  // to it and flash a brief highlight so the user sees where they landed. Both are
  // imperative DOM syncs (the element is the external system); the highlight class
  // is added directly rather than through React state. Runs exactly once — later
  // filtering/paging must not re-yank the viewport.
  const focusScrolledRef = useRef(false);
  useEffect(() => {
    if (focusScrolledRef.current || !focusId || !items.some((i) => i.id === focusId)) return;
    const el = document.getElementById(`resolution-${focusId}`);
    if (!el) return;
    focusScrolledRef.current = true;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    el.classList.add("animate-card-highlight");
    const t = setTimeout(() => el.classList.remove("animate-card-highlight"), 1800);
    return () => clearTimeout(t);
  }, [focusId, items]);

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
    setQ("");
    setCategory(null);
    setOutcome("all");
    setFrom(null);
    setTo(null);
  }

  const manualActive = hasManualFilters({
    q,
    category,
    outcome,
    from,
    to,
    confidenceLow: null,
    confidenceHigh: null,
    selectionIds: null,
  });

  return (
    <section id="history" className="scroll-mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Resolution history</h2>
        {pending && <span className="text-xs text-ink-tertiary">Updating…</span>}
      </div>

      {/* Chart / deep-link selection chip. */}
      {selection && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-tint px-3 py-2 text-xs">
          <span className="text-ink">
            Showing <span className="font-medium">{selection.label}</span>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          {manualActive && (
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

      {items.length === 0 ? (
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
        <ul className="mt-3 flex flex-col gap-3">
          {items.map((row) => (
            <HistoryCard
              key={row.id}
              row={row}
              open={expanded === row.id}
              onToggle={() => setExpanded((cur) => (cur === row.id ? null : row.id))}
            />
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

/** A self-contained resolution card. Collapsed: the essentials (prediction,
 *  outcome, confidence, category, date, Brier + its directional sentence).
 *  Expanded in place: the complete frozen record — reasoning, plan/disconfirm,
 *  the outcome note, and the stored post-mortem. No link out. */
function HistoryCard({
  row,
  open,
  onToggle,
}: {
  row: FullHistoryItem;
  open: boolean;
  onToggle: () => void;
}) {
  const scoreLine =
    row.status === "void"
      ? "Voided — excluded from your score."
      : row.brier !== null
        ? `Brier ${row.brier.toFixed(2)} — ${brierSentence(row.brier)}`
        : "";
  const planLabel = row.predictionKind === "self" ? "Your plan" : "What would change your mind";
  const hasDetail = Boolean(
    row.reasoning?.trim() || row.planOrDisconfirm?.trim() || row.outcomeNote?.trim() || row.postmortem?.trim(),
  );
  const panelId = `history-detail-${row.id}`;

  return (
    <li
      id={`resolution-${row.id}`}
      className="scroll-mt-6 rounded-xl border border-border bg-canvas text-sm shadow-[var(--shadow-card)]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="block w-full rounded-xl p-4 text-left transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 font-medium text-ink">{row.text}</p>
          <span className="flex shrink-0 items-center gap-2">
            <OutcomeBadge status={row.status} outcome={row.outcome} />
            <span className="text-xs text-ink-tertiary" aria-hidden>
              {open ? "▲" : "▼"}
            </span>
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-tertiary">
          {Math.round(row.confidence * 100)}% confident
          {row.category ? (
            <>
              {" · "}
              <span className="capitalize">{row.category}</span>
            </>
          ) : null}
          {" · resolved "}
          {fmtDate(row.resolvedAt)}
        </p>
        {scoreLine && <p className="mt-1 text-xs text-ink-secondary">{scoreLine}</p>}
      </button>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t border-border-subtle px-4 py-4 text-sm">
          {row.reasoning?.trim() || row.planOrDisconfirm?.trim() ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                Your frozen reasoning
              </p>
              <div className="mt-1 flex flex-col gap-2 text-ink-secondary">
                {row.reasoning?.trim() && (
                  <p>
                    <span className="text-ink-tertiary">Why:</span> {row.reasoning}
                  </p>
                )}
                {row.planOrDisconfirm?.trim() && (
                  <p>
                    <span className="text-ink-tertiary">{planLabel}:</span> {row.planOrDisconfirm}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {row.outcomeNote?.trim() && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">What happened</p>
              <p className="mt-1 text-ink-secondary">{row.outcomeNote}</p>
            </div>
          )}

          {row.postmortem?.trim() && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">Looking back</p>
              <p className="mt-1 whitespace-pre-wrap text-ink-secondary">{row.postmortem}</p>
            </div>
          )}

          {!hasDetail && <p className="text-ink-tertiary">No reasoning, note, or post-mortem was recorded.</p>}
        </div>
      )}
    </li>
  );
}
