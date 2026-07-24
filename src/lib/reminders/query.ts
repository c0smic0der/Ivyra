import { inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DuePrediction } from "@/lib/reminders/remindersCore";

// DB-touching only — no unit tests here, same convention as trackRecord/query.ts
// and the postmortem route (the pure decision logic lives in remindersCore.ts).
//
// Unlike every other query in this codebase, this one deliberately has NO
// `eq(predictions.userId, ...)` filter — it's the one system-level statement
// that legitimately spans every user's rows, run only from the secret-guarded
// cron route. Its output must never be echoed back in the route's response (only
// aggregate counts are), and callers must not log the returned `text`
// (CLAUDE.md: prediction content never in logs).

// Fan-out backstop: at most this many predictions are claimed (and emailed) per
// invocation, so one run can't be made to email an unbounded number of users.
export const REMINDER_FANOUT_CAP = 500;

/**
 * Atomically claim the open predictions due on or before `date` (YYYY-MM-DD,
 * UTC) that haven't been reminded yet: mark `reminded_at = now()` and RETURN the
 * claimed rows in ONE statement. A returned row is, by construction, claimed by
 * exactly this invocation — so the route can send off precisely the returned
 * rows and a row can never be sent twice.
 *
 * This replaces the old read-then-write pair (findPredictionsDueToday +
 * markReminded): those two round-trips left a window where two overlapping cron
 * runs both read the same unmarked rows and both emailed (docs/TODO.md). Here,
 * `FOR UPDATE SKIP LOCKED` on the inner select lets concurrent runs claim
 * DISJOINT row sets without blocking, and the `reminded_at IS NULL` guard means
 * a row a prior run already claimed is never re-selected — so the idempotency is
 * enforced in the database, not in a separate pure filter.
 *
 * The predicate is `resolution_date <= date`, not `= date`, so it also SWEEPS
 * any still-unreminded rows that fell past their due date — the overflow beyond
 * `REMINDER_FANOUT_CAP` on a heavy day, or rows missed by a skipped cron run.
 * Ordering oldest-due-first drains that backlog deterministically across runs
 * (each run takes the next ≤cap), so the fan-out cap can DELAY a reminder but
 * never permanently drops one. A row reminded on its due date is already marked,
 * so `<=` never re-reminds it.
 */
export async function claimDueReminders(date: string): Promise<DuePrediction[]> {
  const rows = await db.execute(sql`
    update predictions
    set reminded_at = now()
    where id in (
      select id from predictions
      where status = 'open' and resolution_date <= ${date}::date and reminded_at is null
      order by resolution_date, id
      limit ${REMINDER_FANOUT_CAP}
      for update skip locked
    )
    returning id, user_id as "userId", text
  `);

  return (rows as unknown as Array<{ id: string; userId: string; text: string }>).map((r) => ({
    id: r.id,
    userId: r.userId,
    text: r.text,
  }));
}

/**
 * Undo a claim by clearing `reminded_at` for the given rows, so a later run
 * retries them. The route calls this only when a send throws AFTER the claim —
 * the claim already gave this run exclusive ownership of these rows (SKIP
 * LOCKED), so releasing them can't collide with a concurrent run. It turns the
 * claim-first design's failure mode from "reminder silently dropped" back into
 * "retried next run." This makes reminders at-least-once, not exactly-once: if a
 * send actually delivered but then threw (e.g. a response-parse error after the
 * provider accepted it), the release lets the next run re-send a duplicate. That
 * trade — a rare duplicate over a silent drop — is the intended one; the atomic
 * claim still rules out CONCURRENT double-sends, which was the race being fixed.
 */
export async function releaseReminders(predictionIds: string[]): Promise<void> {
  if (predictionIds.length === 0) return;
  await db
    .update(schema.predictions)
    .set({ remindedAt: null })
    .where(inArray(schema.predictions.id, predictionIds));
}
