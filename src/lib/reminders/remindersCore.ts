// Reminders — pure decision logic (docs §11, §14 Day 9). No DB, no network:
// given a raw Authorization header and a set of due rows, decides whether the
// caller is allowed in and how to group the rows for a one-email-per-user
// send. The DB query and the Resend/admin-API calls live in query.ts, admin.ts,
// and the route handler, exactly like the resolveCore.ts / enrichCore.ts split.

import { timingSafeEqual } from "node:crypto";

/**
 * The scheduler must present `Authorization: Bearer ${CRON_SECRET}` exactly.
 * False on a missing header, wrong secret, missing "Bearer " scheme, or an
 * unset/empty `CRON_SECRET` (never authorize against an empty secret — that
 * would let an empty header through). Uses a constant-time comparison so a
 * network caller can't infer the secret from response-time deltas.
 */
export function isAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length === 0) return false;
  if (!authHeader) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * The UTC calendar date (YYYY-MM-DD) to match against `predictions.resolution_date`
 * (a Postgres `date` column, no time component). UTC is deliberate: the cron
 * fires at a fixed UTC time, so the "today" it computes must not drift with
 * the server's local timezone.
 */
export function dueDateString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface DuePrediction {
  id: string;
  userId: string;
  text: string;
}

// Idempotency is no longer a pure post-filter (`notYetReminded` was removed): it
// now lives in the atomic claim itself (query.ts `claimDueReminders`), which
// marks and returns rows in one statement so a returned row is claimed by
// exactly one run. That closes the concurrency gap the read-then-filter-then-mark
// sequence left open, and there's nothing left for a pure filter to re-check.

/** Groups the flat query result by user, feeding "one email per user." */
export function groupDueByUser(rows: DuePrediction[]): Map<string, DuePrediction[]> {
  const byUser = new Map<string, DuePrediction[]>();
  for (const row of rows) {
    const existing = byUser.get(row.userId);
    if (existing) {
      existing.push(row);
    } else {
      byUser.set(row.userId, [row]);
    }
  }
  return byUser;
}
