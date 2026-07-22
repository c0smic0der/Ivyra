import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DuePrediction } from "@/lib/reminders/remindersCore";

// DB-touching only — no unit tests here, same convention as trackRecord/query.ts
// and the postmortem route (the pure decision logic lives in remindersCore.ts).
//
// Unlike every other query in this codebase, this one deliberately has NO
// `eq(predictions.userId, ...)` filter — it's the one system-level query that
// legitimately spans every user's rows, run only from the secret-guarded cron
// route. Its output must never be echoed back in the route's response (only
// aggregate counts are), and callers must not log the returned `text`
// (CLAUDE.md: prediction content never in logs).

/**
 * Open predictions whose resolution_date is exactly `date` (YYYY-MM-DD, UTC)
 * and that haven't already been reminded. The `isNull(remindedAt)` filter is
 * the primary, efficient idempotency gate; remindersCore's `notYetReminded`
 * re-checks the same condition in pure code so the "second run sends
 * nothing" behavior is unit-testable without a live DB.
 */
export async function findPredictionsDueToday(date: string): Promise<DuePrediction[]> {
  const rows = await db
    .select({
      id: schema.predictions.id,
      userId: schema.predictions.userId,
      text: schema.predictions.text,
      remindedAt: schema.predictions.remindedAt,
    })
    .from(schema.predictions)
    .where(
      and(
        eq(schema.predictions.status, "open"),
        eq(schema.predictions.resolutionDate, date),
        isNull(schema.predictions.remindedAt),
      ),
    );

  return rows;
}

/** Marks the given predictions as reminded so a later run skips them. */
export async function markReminded(predictionIds: string[]): Promise<void> {
  if (predictionIds.length === 0) return;
  await db
    .update(schema.predictions)
    .set({ remindedAt: new Date() })
    .where(inArray(schema.predictions.id, predictionIds));
}
