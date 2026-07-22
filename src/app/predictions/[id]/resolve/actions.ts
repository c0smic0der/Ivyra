"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { brierSentence, type Scorable } from "@/lib/scoring";
import {
  computeResolution,
  computeUserStats,
  type ResolveChoice,
} from "@/lib/resolve/resolveCore";

export type ResolveResult =
  | {
      ok: true;
      isVoid: boolean;
      /** This prediction's Brier; null for Void. */
      brier: number | null;
      /** Deterministic one-line reading of the Brier; null for Void. */
      sentence: string | null;
      /** Updated running Brier over all resolved, non-void predictions. */
      runningBrier: number | null;
      /** Whether the streaming post-mortem should be requested. */
      canPostmortem: boolean;
    }
  | { ok: false; error: "unauthorized" | "not_found" | "already_resolved" };

const VALID_CHOICES: ResolveChoice[] = ["yes", "no", "void"];

/**
 * Resolves a frozen prediction. Deterministic throughout — the Brier is
 * computed by the scoring module (never the LLM). The post-mortem is a
 * separate streaming step the client kicks off only after this returns.
 */
export async function resolvePrediction(input: {
  id: string;
  choice: ResolveChoice;
  outcomeNote: string;
}): Promise<ResolveResult> {
  if (!VALID_CHOICES.includes(input.choice)) return { ok: false, error: "not_found" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const [row] = await db
    .select({
      confidence: schema.predictions.confidence,
      reasoning: schema.predictions.reasoning,
      status: schema.predictions.status,
    })
    .from(schema.predictions)
    .where(and(eq(schema.predictions.id, input.id), eq(schema.predictions.userId, user.id)));

  if (!row) return { ok: false, error: "not_found" };
  // A frozen, already-resolved prediction can't be re-scored — reject here as
  // well as in the page's read-only guard (they must agree).
  if (row.status !== "open") return { ok: false, error: "already_resolved" };

  const confidence = Number(row.confidence);
  const patch = computeResolution(confidence, input.choice);
  const note = input.outcomeNote.trim();

  // Atomic claim: the `status = 'open'` predicate means a concurrent second
  // resolution updates zero rows and loses the race, not double-scores.
  const updated = await db
    .update(schema.predictions)
    .set({
      status: patch.status,
      outcome: patch.outcome,
      outcomeNote: note.length > 0 ? note : null,
      brierScore: patch.brierScore === null ? null : patch.brierScore.toString(),
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(schema.predictions.id, input.id),
        eq(schema.predictions.userId, user.id),
        eq(schema.predictions.status, "open"),
      ),
    )
    .returning({ id: schema.predictions.id });

  if (updated.length === 0) return { ok: false, error: "already_resolved" };

  // Recompute user_stats from the full resolved/void history via the scoring
  // module — voids and open rows are excluded by its own gate.
  const history = await db
    .select({
      confidence: schema.predictions.confidence,
      outcome: schema.predictions.outcome,
      status: schema.predictions.status,
    })
    .from(schema.predictions)
    .where(
      and(
        eq(schema.predictions.userId, user.id),
        inArray(schema.predictions.status, ["resolved", "void"]),
      ),
    );

  const scorable: Scorable[] = history.map((h) => ({
    confidence: Number(h.confidence),
    outcome: h.outcome,
    status: h.status,
  }));
  const stats = computeUserStats(scorable);

  await db
    .insert(schema.userStats)
    .values({
      userId: user.id,
      nResolved: stats.nResolved,
      runningBrier: stats.runningBrier === null ? null : stats.runningBrier.toString(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.userStats.userId,
      set: {
        nResolved: stats.nResolved,
        runningBrier: stats.runningBrier === null ? null : stats.runningBrier.toString(),
        updatedAt: new Date(),
      },
    });

  revalidatePath("/dashboard");

  const isVoid = patch.status === "void";
  return {
    ok: true,
    isVoid,
    brier: patch.brierScore,
    sentence: patch.brierScore === null ? null : brierSentence(patch.brierScore),
    runningBrier: stats.runningBrier,
    canPostmortem: !isVoid && row.reasoning !== null && row.reasoning.trim().length > 0,
  };
}
