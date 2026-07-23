// Resolution-history view logic — pure, client-side, unit-tested. The history
// list is now a live, in-browser view over the user's own resolved rows (loaded
// once, server-side, RLS-scoped): filtering, sorting, and pagination all happen
// here with no navigation, so the list updates dynamically as the user types or
// interacts with the progress chart. Keeping the logic pure (no React, no DOM)
// keeps it testable and the components thin — same split as insightsCore.

export const HISTORY_CATEGORIES = ["work", "health", "relationships", "money", "self"] as const;

export const HISTORY_PAGE_SIZE = 20;

export type HistorySort = "date" | "confidence" | "score";
export type SortDir = "asc" | "desc";
export type OutcomeFilter = "all" | "yes" | "no" | "void";

/** One resolved/void prediction, flattened for the client list. */
export interface HistoryItem {
  id: string;
  text: string;
  /** Stated confidence in [0, 1]. */
  confidence: number;
  outcome: boolean | null;
  status: "resolved" | "void";
  category: string | null;
  /** Stored Brier; null for voids (excluded from scoring). */
  brier: number | null;
  /** ISO timestamp — drives date sort/filter and the displayed date. */
  resolvedAt: string;
}

export interface HistoryFilterState {
  q: string;
  category: string | null;
  outcome: OutcomeFilter;
  /** Inclusive resolution-date bounds, YYYY-MM-DD. */
  from: string | null;
  to: string | null;
  /**
   * Prediction ids selected on the progress chart, or null when the chart
   * isn't driving the list. An empty array means "a selection that matches
   * nothing" — distinct from null, and it correctly yields zero rows.
   */
  selectionIds: string[] | null;
}

export const EMPTY_FILTERS: HistoryFilterState = {
  q: "",
  category: null,
  outcome: "all",
  from: null,
  to: null,
  selectionIds: null,
};

/** True when a text/category/outcome/date filter (not the chart selection) is set. */
export function hasManualFilters(f: HistoryFilterState): boolean {
  return f.q.trim() !== "" || f.category !== null || f.outcome !== "all" || f.from !== null || f.to !== null;
}

function matchesOutcome(item: HistoryItem, outcome: OutcomeFilter): boolean {
  switch (outcome) {
    case "yes":
      return item.status === "resolved" && item.outcome === true;
    case "no":
      return item.status === "resolved" && item.outcome === false;
    case "void":
      return item.status === "void";
    default:
      return true;
  }
}

/** Apply every active filter (all AND-combined). Pure; returns a new array. */
export function filterHistory(items: HistoryItem[], f: HistoryFilterState): HistoryItem[] {
  const needle = f.q.trim().toLowerCase();
  const selection = f.selectionIds === null ? null : new Set(f.selectionIds);
  return items.filter((item) => {
    if (selection !== null && !selection.has(item.id)) return false;
    if (needle !== "" && !item.text.toLowerCase().includes(needle)) return false;
    if (f.category !== null && item.category !== f.category) return false;
    if (!matchesOutcome(item, f.outcome)) return false;
    const day = item.resolvedAt.slice(0, 10);
    if (f.from !== null && day < f.from) return false;
    if (f.to !== null && day > f.to) return false;
    return true;
  });
}

/**
 * Sort by the chosen column. Voids (null Brier) always sink to the bottom on a
 * score sort regardless of direction — a missing score isn't "better" or
 * "worse", so it shouldn't lead either end. Ties break by date then id so the
 * order is stable across renders.
 */
export function sortHistory(items: HistoryItem[], sort: HistorySort, dir: SortDir): HistoryItem[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (sort === "score") {
      if (a.brier === null && b.brier === null) return tiebreak(a, b);
      if (a.brier === null) return 1; // nulls last, always
      if (b.brier === null) return -1;
      if (a.brier !== b.brier) return (a.brier - b.brier) * factor;
      return tiebreak(a, b);
    }
    if (sort === "confidence") {
      if (a.confidence !== b.confidence) return (a.confidence - b.confidence) * factor;
      return tiebreak(a, b);
    }
    // date
    if (a.resolvedAt !== b.resolvedAt) return a.resolvedAt < b.resolvedAt ? -factor : factor;
    return tiebreak(a, b);
  });
}

function tiebreak(a: HistoryItem, b: HistoryItem): number {
  if (a.resolvedAt !== b.resolvedAt) return a.resolvedAt < b.resolvedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface Paged<T> {
  pageItems: T[];
  page: number;
  total: number;
  totalPages: number;
}

/** Clamp `page` into range and return that slice plus the paging metadata. */
export function paginate<T>(items: T[], page: number, size = HISTORY_PAGE_SIZE): Paged<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * size;
  return { pageItems: items.slice(start, start + size), page: clamped, total, totalPages };
}
