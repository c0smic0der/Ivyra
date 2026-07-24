// Resolution — pure decision + math (docs §4.6, §7, §9.3). No DB, no network,
// no AI: given a user's YES/NO/Void choice this decides the row patch and the
// recomputed user_stats, and separately decides whether a post-mortem should
// be generated. The DB-touching orchestration lives in the Server Action
// (actions.ts) and the streaming route handler; this file is unit-testable
// with zero DATABASE_URL and zero network, exactly like enrichCore.ts.
//
// The Brier here comes straight from the scoring module — the LLM never scores.

import { brierScore, resolvedNonVoid, runningBrier, type Scorable } from "@/lib/scoring";

export type ResolveChoice = "yes" | "no" | "void";

/** The columns a resolution writes onto the frozen prediction row. */
export interface ResolutionPatch {
  status: "resolved" | "void";
  outcome: boolean | null;
  /** null for Void (excluded from every score); otherwise the exact Brier. */
  brierScore: number | null;
}

/**
 * Maps a user's choice to the row patch. Void is scored as nothing — no
 * outcome, no Brier — so it never enters an aggregate. YES/NO route the
 * confidence + outcome through the scoring module's `brierScore`, which is the
 * only place a per-prediction Brier is ever computed.
 */
export function computeResolution(confidence: number, choice: ResolveChoice): ResolutionPatch {
  if (choice === "void") {
    return { status: "void", outcome: null, brierScore: null };
  }
  const outcome = choice === "yes";
  return { status: "resolved", outcome, brierScore: brierScore(confidence, outcome) };
}

export interface UserStatsSnapshot {
  nResolved: number;
  runningBrier: number | null;
}

/**
 * Recomputes the cached user_stats from the user's full history. Voids and
 * still-open rows are excluded — this uses the scoring module's own gate via
 * `runningBrier`, and counts the same resolved/non-void set for `nResolved`.
 * Recomputing from scratch (rather than incrementing) means the cache can
 * never drift from the deterministic source of truth.
 */
export function computeUserStats(preds: Scorable[]): UserStatsSnapshot {
  // Count off the SAME gate the Brier averages over, so n_resolved can never
  // drift from the Brier's denominator — one predicate, defined in the scoring
  // module (docs: the scoring module is the single source of truth for who
  // counts). runningBrier runs the identical gate internally.
  const scored = resolvedNonVoid(preds);
  return { nResolved: scored.length, runningBrier: runningBrier(preds) };
}

export type PostmortemDecision = "return_stored" | "skip" | "generate";

/**
 * Decides what the post-mortem endpoint should do, before any network call.
 * Order matters: a stored post-mortem is returned verbatim (idempotent, never
 * regenerated or re-charged); Void / no-reasoning skip entirely; otherwise a
 * fresh generation is warranted. The daily cap is NOT decided here anymore — the
 * route atomically reserves a slot via `reserveAiCallIfUnderCap` on a "generate"
 * decision, and a null reservation is the graceful over-cap degrade (the score
 * still rendered; the narrative just says it's unavailable). Folding the cap into
 * this pure predicate would reintroduce the read-then-act race the reservation
 * closes.
 */
export function postmortemDecision(input: {
  isVoid: boolean;
  hasReasoning: boolean;
  existingPostmortem: string | null;
}): PostmortemDecision {
  if (input.existingPostmortem && input.existingPostmortem.trim().length > 0) {
    return "return_stored";
  }
  if (input.isVoid || !input.hasReasoning) return "skip";
  return "generate";
}
