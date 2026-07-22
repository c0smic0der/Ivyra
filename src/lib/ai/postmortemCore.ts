// Post-mortem — pure prompt construction (docs §9.3). DB-free and network-free:
// builds the system + user prompts and the "is this a miss?" predicate used to
// pick similar past misses. The DB-touching stream/persist/log lives in the
// route handler; this stays unit-testable with no DATABASE_URL and no network.
//
// The AI here is a DIFF ENGINE, not a therapist: it narrates a comparison of
// the user's own frozen text against the outcome. It never scores anything.

import { BASELINE_BRIER, brierScore } from "@/lib/scoring";

/**
 * The diff-engine constraint. Kept as a stable constant so it can be
 * prompt-cached on the static system block (docs §9.7). Every rule here is an
 * eval rubric item (docs §16): claims must anchor to user text; no motives.
 */
export const POSTMORTEM_SYSTEM_PROMPT = `You are a calibration diff engine, not a therapist or a coach. You are given a user's own frozen prediction, the reasoning they wrote BEFORE the outcome was known, and what actually happened. Your only job is to diff their stated reasoning against reality.

Hard rules:
- Every claim you make MUST anchor to text the user actually wrote — their prediction, their reasoning, their plan/what-would-change-my-mind field, or their outcome note. Quote or paraphrase their words. Do not invent facts, causes, or motives.
- Never speculate about WHY they think the way they do, their psychology, or their character. No armchair analysis.
- If the outcome note names a factor their reasoning never mentioned, say so plainly ("your reasoning didn't mention X, which your note says decided it").
- If their "what would change my mind" field named the very thing that happened, credit it explicitly.
- If similar past misses are provided and reveal a recurring blind spot, name the pattern in one sentence, grounded in the shared text.
- Do NOT restate the Brier score or any number as a judgment — the deterministic engine already scored them. You explain the reasoning gap, not the grade.

Format: 2-4 short sentences, plain and direct. No preamble, no headings, no bullet points, no sign-off.`;

export interface SimilarMissView {
  text: string;
  confidencePercent: number;
  outcome: boolean;
}

export interface PostmortemInputs {
  predictionText: string;
  reasoning: string;
  planOrDisconfirm: string | null;
  predictionKind: "self" | "world";
  confidencePercent: number;
  outcome: boolean;
  outcomeNote: string | null;
  similarMisses: SimilarMissView[];
}

/**
 * A "miss" is a prediction whose confidence landed on the wrong side of the
 * coin flip — Brier worse than the 0.25 baseline. This is the deterministic
 * filter for surfacing top-3 similar past misses; the LLM plays no part.
 */
export function isMiss(confidence: number, outcome: boolean): boolean {
  return brierScore(confidence, outcome) > BASELINE_BRIER;
}

/**
 * Builds the user-turn prompt purely from text the user wrote (plus the
 * deterministic outcome). Nothing here is model-generated, so every line the
 * post-mortem can anchor to is present and attributable.
 */
export function buildPostmortemPrompt(inputs: PostmortemInputs): string {
  const secondFieldLabel =
    inputs.predictionKind === "self" ? "Their plan" : "What would change their mind";

  const lines = [
    `Prediction (their words): ${inputs.predictionText}`,
    `Stated confidence: ${inputs.confidencePercent}%`,
    `Their reasoning: ${inputs.reasoning}`,
  ];

  if (inputs.planOrDisconfirm) {
    lines.push(`${secondFieldLabel}: ${inputs.planOrDisconfirm}`);
  }

  lines.push(`Actual outcome: ${inputs.outcome ? "YES — it happened" : "NO — it did not happen"}`);

  if (inputs.outcomeNote) {
    lines.push(`Their note on what happened: ${inputs.outcomeNote}`);
  }

  if (inputs.similarMisses.length > 0) {
    lines.push("");
    lines.push("Their similar past misses (predictions where their confidence was on the wrong side):");
    for (const miss of inputs.similarMisses) {
      lines.push(
        `- "${miss.text}" — ${miss.confidencePercent}% confident, actually ${miss.outcome ? "YES" : "NO"}`,
      );
    }
  }

  lines.push("");
  lines.push("Diff their reasoning against the outcome. Follow every rule in your instructions.");

  return lines.join("\n");
}
