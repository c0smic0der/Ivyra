import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  JOURNAL_PAGE_SIZE,
  type JournalPage,
  type JournalRow,
  toJournalEntry,
} from "./journalView";

// The ONE server-side read behind the journal timeline. A faithful SQL
// translation of runJournalQuery/runJournalWindow in journalView.ts (which the
// tests certify): the same userId scope, the same newest-first order, the same
// paging. The `eq(userId)` guard is the non-optional base condition on every
// query — no page number and no caller can widen it to another user's rows.
//
// Content (text, reasoning) never leaves this module as a query param or a log;
// it travels only inside the returned view model.

const p = schema.predictions;

/** All statuses belong on the timeline — it is the whole journal, not a queue. */
function mapRow(r: {
  id: string;
  userId: string;
  text: string;
  decision: string | null;
  reasoning: string | null;
  confidence: string;
  resolutionDate: string;
  status: "open" | "resolved" | "void";
  outcome: boolean | null;
  createdAt: Date;
}): JournalRow {
  return {
    id: r.id,
    userId: r.userId,
    text: r.text,
    decision: r.decision,
    reasoning: r.reasoning,
    confidence: Number(r.confidence),
    resolutionDate: r.resolutionDate,
    status: r.status,
    outcome: r.outcome,
    createdAt: r.createdAt.toISOString(),
  };
}

const columns = {
  id: p.id,
  userId: p.userId,
  text: p.text,
  decision: p.decision,
  reasoning: p.reasoning,
  confidence: p.confidence,
  resolutionDate: p.resolutionDate,
  status: p.status,
  outcome: p.outcome,
  createdAt: p.createdAt,
} as const;

/** Clamp an untrusted page/count arg to a sane positive integer. */
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Ceiling on how many pages a single restore may pull back — a guard on the
 * client-supplied page count, not a UX limit anyone reaches by scrolling. */
export const MAX_JOURNAL_PAGES = 50;

/**
 * One page of the timeline, newest-first, scoped to `userId`. Fetches
 * `pageSize + 1` rows so `hasMore` is known without a second COUNT query.
 */
export async function queryJournal(
  userId: string,
  page: number,
  pageSize = JOURNAL_PAGE_SIZE,
): Promise<JournalPage> {
  const safePage = clampInt(page, 1, MAX_JOURNAL_PAGES);
  const rows = await db
    .select(columns)
    .from(p)
    .where(eq(p.userId, userId))
    .orderBy(desc(p.createdAt), desc(p.id))
    .limit(pageSize + 1)
    .offset((safePage - 1) * pageSize);

  const hasMore = rows.length > pageSize;
  return { items: rows.slice(0, pageSize).map(mapRow).map(toJournalEntry), hasMore };
}

/**
 * The first `pageCount` pages as one window — the restore read used when a user
 * returns from resolving an entry. Refetches FRESH, so a just-resolved entry
 * shows its updated annotation at its unchanged (createdAt-stable) position.
 */
export async function queryJournalWindow(
  userId: string,
  pageCount: number,
  pageSize = JOURNAL_PAGE_SIZE,
): Promise<JournalPage> {
  const safeCount = clampInt(pageCount, 1, MAX_JOURNAL_PAGES);
  const limit = safeCount * pageSize;
  const rows = await db
    .select(columns)
    .from(p)
    .where(eq(p.userId, userId))
    .orderBy(desc(p.createdAt), desc(p.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  return { items: rows.slice(0, limit).map(mapRow).map(toJournalEntry), hasMore };
}

/**
 * Every entry timestamp for the user, newest first — just the dates, no content.
 * Feeds the full month navigator (monthNavFromTimestamps) so the rail lists all
 * months even before the older pages are loaded.
 */
export async function queryJournalTimestamps(userId: string): Promise<string[]> {
  const rows = await db
    .select({ createdAt: p.createdAt })
    .from(p)
    .where(eq(p.userId, userId))
    .orderBy(desc(p.createdAt), desc(p.id));
  return rows.map((r) => r.createdAt.toISOString());
}
