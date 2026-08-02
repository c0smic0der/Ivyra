// Resolution-history view logic — pure, framework-free, unit-tested. This module
// is the single source of truth for how the resolution history is scoped,
// filtered, sorted, and paged. The *server* query (historyQuery.ts) and the
// dashboard/insights components both defer to the semantics defined here, so
// there is one implementation of "which of MY resolved rows match", not two.
//
// Security note: `runHistoryQuery` takes the viewer's userId and drops every row
// that isn't theirs BEFORE any filter runs, mirroring the `eq(userId)` guard the
// SQL query hard-codes. No filter combination can widen that scope.

export const HISTORY_CATEGORIES = ["work", "health", "relationships", "money", "self"] as const;

/** Full-mode page size. Compact mode is a fixed, unfiltered glance (below). */
export const HISTORY_PAGE_SIZE = 20;

/** Compact (dashboard) mode always shows the most recent this-many resolutions. */
export const COMPACT_LIMIT = 10;

export type HistorySort = "date" | "confidence" | "score";
export type SortDir = "asc" | "desc";
export type OutcomeFilter = "all" | "yes" | "no" | "void";
export type HistoryMode = "compact" | "full";

/**
 * A resolved/void prediction as it leaves the database, before projection. The
 * pure query mirror operates on these (they carry `userId`, so scoping can be
 * tested); the components never see this shape — they get the projections below.
 */
export interface RawHistoryRow {
  userId: string;
  id: string;
  text: string;
  confidence: number;
  outcome: boolean | null;
  status: "resolved" | "void";
  category: string | null;
  brier: number | null;
  resolvedAt: string; // ISO timestamp
  predictionKind: "self" | "world";
  reasoning: string | null;
  planOrDisconfirm: string | null;
  outcomeNote: string | null;
  postmortem: string | null;
}

/**
 * Compact projection — the dashboard glance. DELIBERATELY omits confidence,
 * Brier, category, reasoning, and post-mortem: the dashboard shows only the
 * plain record (what was predicted, how it landed, when). Scoring and
 * interpretation live on /insights.
 */
export interface CompactHistoryItem {
  id: string;
  text: string;
  outcome: boolean | null;
  status: "resolved" | "void";
  resolvedAt: string;
}

/** Full projection — the /insights history. Carries the COMPLETE record so each
 *  card is self-contained (no link out to a detail page): the frozen reasoning
 *  and plan/disconfirmation, the outcome note, and the stored post-mortem. */
export interface FullHistoryItem extends CompactHistoryItem {
  confidence: number;
  category: string | null;
  brier: number | null;
  predictionKind: "self" | "world";
  reasoning: string | null;
  planOrDisconfirm: string | null;
  outcomeNote: string | null;
  postmortem: string | null;
}

/** Every knob the full-mode history can be queried by. Chart selections feed the
 *  confidence-band and id fields; the toolbar feeds the rest. */
export interface HistoryFullParams {
  q: string;
  category: string | null;
  outcome: OutcomeFilter;
  /** Inclusive resolution-date bounds, YYYY-MM-DD. */
  from: string | null;
  to: string | null;
  /** Confidence-band bounds from a calibration-curve dot. `low` inclusive; `high`
   *  exclusive, except the top band [0.9, 1.0] which is closed (matches the
   *  scoring module's decile buckets). */
  confidenceLow: number | null;
  confidenceHigh: number | null;
  /** Specific prediction ids from a progress-chart selection. An empty array is
   *  "a selection that matches nothing" — distinct from null (no selection). */
  selectionIds: string[] | null;
  sort: HistorySort;
  dir: SortDir;
  /** 1-based. */
  page: number;
}

export const EMPTY_PARAMS: HistoryFullParams = {
  q: "",
  category: null,
  outcome: "all",
  from: null,
  to: null,
  confidenceLow: null,
  confidenceHigh: null,
  selectionIds: null,
  sort: "date",
  dir: "desc",
  page: 1,
};

/** Just the filtering knobs (no sort/paging), for the pure filter helper. */
export type HistoryFilterState = Pick<
  HistoryFullParams,
  "q" | "category" | "outcome" | "from" | "to" | "confidenceLow" | "confidenceHigh" | "selectionIds"
>;

export const EMPTY_FILTERS: HistoryFilterState = {
  q: "",
  category: null,
  outcome: "all",
  from: null,
  to: null,
  confidenceLow: null,
  confidenceHigh: null,
  selectionIds: null,
};

/** True when a text/category/outcome/date filter (NOT a chart selection) is set —
 *  drives whether the "Clear filters" affordance shows. Chart selections have
 *  their own visible, clearable chip, so they're excluded here. */
export function hasManualFilters(f: HistoryFilterState): boolean {
  return f.q.trim() !== "" || f.category !== null || f.outcome !== "all" || f.from !== null || f.to !== null;
}

/** True when any chart selection (band or id set) is active. */
export function hasChartSelection(f: HistoryFilterState): boolean {
  return f.confidenceLow !== null || f.confidenceHigh !== null || f.selectionIds !== null;
}

function matchesOutcome(row: { status: string; outcome: boolean | null }, outcome: OutcomeFilter): boolean {
  switch (outcome) {
    case "yes":
      return row.status === "resolved" && row.outcome === true;
    case "no":
      return row.status === "resolved" && row.outcome === false;
    case "void":
      return row.status === "void";
    default:
      return true;
  }
}

/**
 * Apply every active filter (all AND-combined) to raw rows. Pure; returns a new
 * array. The confidence band is left-closed / right-open to match the scoring
 * module's deciles, except the top band [0.9, 1.0] which is closed so a stated
 * 100% still lands somewhere.
 */
export function filterRows<T extends RawHistoryRow>(rows: T[], f: HistoryFilterState): T[] {
  const needle = f.q.trim().toLowerCase();
  const selection = f.selectionIds === null ? null : new Set(f.selectionIds);
  return rows.filter((row) => {
    if (selection !== null && !selection.has(row.id)) return false;
    if (needle !== "" && !row.text.toLowerCase().includes(needle)) return false;
    if (f.category !== null && row.category !== f.category) return false;
    if (!matchesOutcome(row, f.outcome)) return false;
    if (f.confidenceLow !== null && row.confidence < f.confidenceLow) return false;
    if (f.confidenceHigh !== null) {
      const closed = f.confidenceHigh >= 1;
      if (closed ? row.confidence > f.confidenceHigh : row.confidence >= f.confidenceHigh) return false;
    }
    const day = row.resolvedAt.slice(0, 10);
    if (f.from !== null && day < f.from) return false;
    if (f.to !== null && day > f.to) return false;
    return true;
  });
}

/**
 * Sort by the chosen column. Voids (null Brier) always sink to the bottom on a
 * score sort regardless of direction — a missing score isn't "better" or
 * "worse". Ties break by date then id so order is stable across renders.
 */
export function sortRows<T extends RawHistoryRow>(rows: T[], sort: HistorySort, dir: SortDir): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
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

function tiebreak(a: RawHistoryRow, b: RawHistoryRow): number {
  if (a.resolvedAt !== b.resolvedAt) return a.resolvedAt < b.resolvedAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function toCompact(row: RawHistoryRow): CompactHistoryItem {
  return { id: row.id, text: row.text, outcome: row.outcome, status: row.status, resolvedAt: row.resolvedAt };
}

function toFull(row: RawHistoryRow): FullHistoryItem {
  return {
    id: row.id,
    text: row.text,
    outcome: row.outcome,
    status: row.status,
    resolvedAt: row.resolvedAt,
    confidence: row.confidence,
    category: row.category,
    brier: row.brier,
    predictionKind: row.predictionKind,
    reasoning: row.reasoning,
    planOrDisconfirm: row.planOrDisconfirm,
    outcomeNote: row.outcomeNote,
    postmortem: row.postmortem,
  };
}

export interface CompactResult {
  items: CompactHistoryItem[];
  total: number;
}
export interface FullResult {
  items: FullHistoryItem[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * The canonical query, in memory. The SQL query in historyQuery.ts is a faithful
 * translation of THIS — same scoping, same filters, same sort, same paging — so
 * these tests certify the real behaviour. Always drops foreign-user and open
 * rows first; compact mode ignores every filter param and never projects
 * confidence/Brier.
 */
export function runHistoryQuery(
  rows: RawHistoryRow[],
  userId: string,
  mode: "compact",
  params?: HistoryFullParams,
): CompactResult;
export function runHistoryQuery(
  rows: RawHistoryRow[],
  userId: string,
  mode: "full",
  params: HistoryFullParams,
): FullResult;
export function runHistoryQuery(
  rows: RawHistoryRow[],
  userId: string,
  mode: HistoryMode,
  params: HistoryFullParams = EMPTY_PARAMS,
): CompactResult | FullResult {
  const scoped = rows.filter(
    (r) => r.userId === userId && (r.status === "resolved" || r.status === "void"),
  );

  if (mode === "compact") {
    const sorted = sortRows(scoped, "date", "desc");
    return { items: sorted.slice(0, COMPACT_LIMIT).map(toCompact), total: scoped.length };
  }

  const filtered = filterRows(scoped, params);
  const sorted = sortRows(filtered, params.sort, params.dir);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, params.page), totalPages);
  const start = (page - 1) * HISTORY_PAGE_SIZE;
  return {
    items: sorted.slice(start, start + HISTORY_PAGE_SIZE).map(toFull),
    total,
    page,
    totalPages,
  };
}

// --- chart-click → history-filter mappings ---------------------------------
// Both charts filter the SAME history instance in-page (no navigation). Each
// click maps deterministically to a filter patch + a human label; these pure
// mappers are what the chart-click tests certify.

/** A committed chart selection: a label for the clearable chip and the params it
 *  contributes (AND-combined with the toolbar filters). `nRange` is progress-only
 *  (the chart redraws its selection box from it). */
export interface HistoryChartFilter {
  label: string;
  patch: Partial<
    Pick<HistoryFullParams, "confidenceLow" | "confidenceHigh" | "selectionIds">
  >;
  nRange?: [number, number];
}

function pct(v: number): number {
  return Math.round(v * 100);
}

/** "70–80% confidence" for a band [0.7, 0.8). */
export function bandLabel(low: number, high: number): string {
  return `${pct(low)}–${pct(high)}% confidence`;
}

/**
 * The record view is deep-linked as /insights?resolution=<id>. Only focus the
 * card when the id belongs to THIS user — `ownedIds` is the caller's already
 * user-scoped resolution set. A foreign or opaque uuid focuses nothing and
 * reveals nothing, so the record view can never surface another user's entry.
 */
export function resolveFocusId(
  ownedIds: Iterable<string>,
  requested: string | null | undefined,
): string | null {
  if (!requested) return null;
  for (const id of ownedIds) if (id === requested) return requested;
  return null;
}

/**
 * Calibration-curve dot → confidence-band filter. Clicking a dot narrows the
 * history to the predictions in that decile — same band the dot aggregates.
 */
export function calibrationBandFilter(point: { low: number; high: number }): HistoryChartFilter {
  return {
    label: bandLabel(point.low, point.high),
    patch: { confidenceLow: point.low, confidenceHigh: point.high },
  };
}

/** Progress-chart single point → that one resolution. */
export function progressPointFilter(point: { n: number; predictionId: string }): HistoryChartFilter {
  return {
    label: `Resolution #${point.n}`,
    patch: { selectionIds: [point.predictionId] },
    nRange: [point.n, point.n],
  };
}

/** Progress-chart brushed range → the resolutions in [lo, hi]. */
export function progressRangeFilter(
  points: Array<{ n: number; predictionId: string }>,
  lo: number,
  hi: number,
): HistoryChartFilter | null {
  const chosen = points.filter((p) => p.n >= lo && p.n <= hi);
  if (chosen.length === 0) return null;
  if (chosen.length === 1) return progressPointFilter(chosen[0]!);
  return {
    label: `Resolutions #${lo}–#${hi} (${chosen.length})`,
    patch: { selectionIds: chosen.map((p) => p.predictionId) },
    nRange: [lo, hi],
  };
}

/** Merge a chart selection's patch onto base params (used by the full-mode UI). */
export function applyChartFilter(base: HistoryFullParams, chart: HistoryChartFilter | null): HistoryFullParams {
  return {
    ...base,
    confidenceLow: null,
    confidenceHigh: null,
    selectionIds: null,
    ...(chart?.patch ?? {}),
  };
}
