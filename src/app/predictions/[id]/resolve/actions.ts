"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { brierSentence, type Scorable } from "@/lib/scoring";
import {
  computeResolution,
  computeUserStats,
  isValidStance,
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
  | {
      ok: false;
      error: "unauthorized" | "not_found" | "already_resolved" | "invalid_stance" | "unexpected";
    };

const VALID_CHOICES: ResolveChoice[] = ["yes", "no", "void"];

/**
 * Resolves a frozen prediction. Deterministic throughout — the Brier is
 * computed by the scoring module (never the LLM). The post-mortem is a
 * separate streaming step the client kicks off only after this returns.
 *
 * `reflection` and `stance` are the decision layer's subjective fields
 * (docs/06-decision-layer.md §2.2) — both optional, never gating the verdict,
 * and only ever persisted for a decision entry (`decision` non-null); a
 * legacy forecast row ignores whatever a client sends here, since the
 * question is meaningless without a decision to look back on.
 */
export async function resolvePrediction(input: {
  id: string;
  choice: ResolveChoice;
  outcomeNote: string;
  reflection?: string;
  stance?: string;
}): Promise<ResolveResult> {
  if (!VALID_CHOICES.includes(input.choice)) return { ok: false, error: "not_found" };
  // Validated before touching the DB — the DB's check constraint (mirroring
  // the same stanceValues) is the backstop, not the primary gate. Captured to a
  // local so the type guard's narrowing survives past this block.
  const stanceInput = input.stance;
  if (stanceInput !== undefined && !isValidStance(stanceInput)) {
    return { ok: false, error: "invalid_stance" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  // Everything below touches the DB. A failure returns a generic "unexpected"
  // error the client renders as a friendly line — never an unhandled 500. The
  // specific not_found/already_resolved returns are plain returns (not throws),
  // so they pass through the try unaffected.
  try {
    const [row] = await db
      .select({
        confidence: schema.predictions.confidence,
        reasoning: schema.predictions.reasoning,
        status: schema.predictions.status,
        decision: schema.predictions.decision,
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

    // The subjective layer only exists for a decision entry — a legacy
    // forecast row (decision null) ignores whatever a client sends here rather
    // than persisting a reflection/stance the question was never meaningful for.
    const isDecision = row.decision !== null;
    const reflection = isDecision ? input.reflection?.trim() || null : null;
    const stance = isDecision ? (stanceInput ?? null) : null;

    // Atomic claim: the `status = 'open'` predicate means a concurrent second
    // resolution updates zero rows and loses the race, not double-scores. The
    // verdict, outcome note, reflection, and stance land in this ONE UPDATE
    // statement — Postgres commits or rolls back the whole row together, so a
    // constraint failure on any column (e.g. the stance check) leaves nothing
    // written, never a half-updated row.
    const updated = await db
      .update(schema.predictions)
      .set({
        status: patch.status,
        outcome: patch.outcome,
        outcomeNote: note.length > 0 ? note : null,
        brierScore: patch.brierScore === null ? null : patch.brierScore.toString(),
        reflection,
        stance,
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
  } catch (error) {
    console.error("resolvePrediction: failed", error instanceof Error ? error.name : "UnknownError");
    return { ok: false, error: "unexpected" };
  }
}
