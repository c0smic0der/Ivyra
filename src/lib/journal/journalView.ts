// The journal timeline — pure, serializable view logic for the home page.
//
// The register is a journal: dated entries in the user's own words, newest
// first, grouped by month. Chronology is the ONLY sort key; confidence and
// scores are annotations on the right, never sort keys.
//
// Split of concerns (mirrors historyView.ts ⇄ historyQuery.ts):
//  · This file is the in-memory reference — pure functions the tests certify.
//  · journalQuery.ts is the faithful SQL translation (scoping, ordering, paging).
//
// Two deliberate boundaries:
//  · The Brier annotation comes from the scoring module (`brierScore`), never a
//    stored column and never inline math — "all numbers come from scoring".
//  · Month grouping and the per-entry day label depend on the browser timezone,
//    so `groupByMonth` takes an explicit `timeZone` and the CLIENT supplies it.
//    Everything a server can do (scope, order, page, score) is done before this.

import { brierScore } from "@/lib/scoring";

/** Rows per page for the timeline's "Load more". */
export const JOURNAL_PAGE_SIZE = 15;

/** Char budget for the two-line reasoning preview before it is truncated. */
export const PREVIEW_CHAR_BUDGET = 160;

/** The minimal DB shape the timeline reads. Confidence is already a number. */
export interface JournalRow {
  id: string;
  userId: string;
  text: string;
  reasoning: string | null;
  /** Stated confidence in [0, 1]. */
  confidence: number;
  /** Bare calendar date "YYYY-MM-DD" (no timezone). */
  resolutionDate: string;
  status: "open" | "resolved" | "void";
  outcome: boolean | null;
  /** ISO instant the entry was written — formatted in the viewer's zone. */
  createdAt: string;
}

/** The right-aligned annotation, discriminated by lifecycle state. */
export type Annotation =
  | { kind: "open"; confidencePct: number; resolvesLabel: string }
  | { kind: "resolved"; outcome: boolean; brier: number }
  | { kind: "void" };

/** A serializable entry handed to the client component. */
export interface JournalEntry {
  id: string;
  /** ISO instant — the client formats the day + month in local time. */
  createdAt: string;
  text: string;
  /** Two-line muted preview of the frozen reasoning; null when none was written. */
  preview: string | null;
  annotation: Annotation;
}

/** One page (or window) of the timeline. */
export interface JournalPage {
  items: JournalEntry[];
  hasMore: boolean;
}

/**
 * Format a bare resolution date as a compact "15/8". The column is a calendar
 * date with no time or zone, so it is formatted in UTC — matching the app-wide
 * convention for bare `date` columns (never local-time math on them).
 */
export function formatResolveDate(resolutionDate: string): string {
  // Parse the YYYY-MM-DD parts directly rather than via Date() — no timezone can
  // shift a bare calendar date, and formatting from the parts guarantees the
  // compact, no-leading-zero "15/8" shape the design calls for (Intl pads it).
  const [, m, d] = resolutionDate.split("-");
  return `${Number(d)}/${Number(m)}`;
}

/**
 * Collapse whitespace and truncate the frozen reasoning to a two-line budget.
 * Returns null when there is nothing to preview. Truncation prefers a word
 * boundary and appends an ellipsis; the UI additionally line-clamps to 2 lines,
 * so this is the hard upper bound, not the visible cutoff on every screen.
 */
export function reasoningPreview(
  reasoning: string | null,
  maxChars = PREVIEW_CHAR_BUDGET,
): string | null {
  if (reasoning === null) return null;
  const collapsed = reasoning.replace(/\s+/g, " ").trim();
  if (collapsed === "") return null;
  if (collapsed.length <= maxChars) return collapsed;

  const slice = collapsed.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  // Only cut on a word boundary when it doesn't discard most of the budget.
  const cut = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/**
 * Build the right-aligned annotation for one row. The Brier is (re)computed by
 * the scoring module from the frozen confidence and outcome — the component
 * never does the math and never trusts a denormalized column.
 */
export function annotationFor(row: JournalRow): Annotation {
  if (row.status === "void") return { kind: "void" };
  if (row.status === "resolved" && row.outcome !== null) {
    return { kind: "resolved", outcome: row.outcome, brier: brierScore(row.confidence, row.outcome) };
  }
  return {
    kind: "open",
    confidencePct: Math.round(row.confidence * 100),
    resolvesLabel: formatResolveDate(row.resolutionDate),
  };
}

/**
 * Where tapping a timeline entry goes. Open entries lead to their resolve
 * screen; resolved and void entries lead to the read-only record view — the
 * self-contained /insights history card (frozen claim, confidence, verdict,
 * Brier, full reasoning, outcome note, and post-mortem), focused by id. Reading
 * a finished entry back is the most journal-like act the app supports, so it is
 * one tap from the timeline (docs/04-journal-reframe §1).
 */
export function entryHref(entry: JournalEntry): string {
  return entry.annotation.kind === "open"
    ? `/predictions/${entry.id}/resolve`
    : `/insights?resolution=${entry.id}#history`;
}

/** Map a raw row to the serializable entry sent to the client. */
export function toJournalEntry(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    createdAt: row.createdAt,
    text: row.text,
    preview: reasoningPreview(row.reasoning),
    annotation: annotationFor(row),
  };
}

/** A month section of the timeline, newest month first. */
export interface MonthSection {
  /** Stable "YYYY-MM" key in the given zone. */
  key: string;
  /** Uppercased month name for the header, e.g. "JULY". */
  label: string;
  entries: Array<{ entry: JournalEntry; dayLabel: string }>;
}

/**
 * Group already-ordered (newest-first) entries into month sections, in the
 * viewer's timezone. Both the section boundary and each entry's day label are
 * computed in `timeZone`, so they can never disagree at a month edge (an entry
 * written 11pm on Jul 31 in New York is July here and "31 Jul", even though the
 * same instant is August 1 in UTC).
 */
export function groupByMonth(entries: JournalEntry[], timeZone: string): MonthSection[] {
  const keyFmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  });
  const labelFmt = new Intl.DateTimeFormat("en-US", { month: "long", timeZone });
  const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone });

  const sections: MonthSection[] = [];
  for (const entry of entries) {
    const at = new Date(entry.createdAt);
    // en-CA yields "2026-07-…"; take the YYYY-MM prefix as the stable key.
    const key = keyFmt.format(at).slice(0, 7);
    let section = sections[sections.length - 1];
    if (!section || section.key !== key) {
      section = { key, label: labelFmt.format(at).toUpperCase(), entries: [] };
      sections.push(section);
    }
    section.entries.push({ entry, dayLabel: dayFmt.format(at) });
  }
  return sections;
}

/** Newest-first with a stable id tiebreak — the single ordering both the pure
 * reference and the SQL query obey. */
function byNewest(a: JournalRow, b: JournalRow): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/**
 * In-memory reference for the paged timeline read. Scopes to `userId` FIRST
 * (the non-negotiable guard the SQL query also applies), orders newest-first,
 * and returns one page plus whether more rows exist. `journalQuery.queryJournal`
 * is certified against this.
 */
export function runJournalQuery(
  rows: JournalRow[],
  userId: string,
  page: number,
  pageSize = JOURNAL_PAGE_SIZE,
): JournalPage {
  const scoped = rows.filter((r) => r.userId === userId).sort(byNewest);
  const start = (page - 1) * pageSize;
  const slice = scoped.slice(start, start + pageSize);
  return { items: slice.map(toJournalEntry), hasMore: scoped.length > start + pageSize };
}

/**
 * In-memory reference for the restore read: the first `pageCount` pages as one
 * window. Used when the user returns from resolving an entry — it refetches the
 * pages they had loaded, FRESH, so a just-resolved entry shows its updated
 * annotation at its unchanged position.
 */
export function runJournalWindow(
  rows: JournalRow[],
  userId: string,
  pageCount: number,
  pageSize = JOURNAL_PAGE_SIZE,
): JournalPage {
  const scoped = rows.filter((r) => r.userId === userId).sort(byNewest);
  const limit = pageCount * pageSize;
  return { items: scoped.slice(0, limit).map(toJournalEntry), hasMore: scoped.length > limit };
}
