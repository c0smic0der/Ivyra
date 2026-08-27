// Post-mortem — pure prompt construction (docs §9.3). DB-free and network-free:
// builds the system + user prompts and the "is this a miss?" predicate used to
// pick similar past misses. The DB-touching stream/persist/log lives in the
// route handler; this stays unit-testable with no DATABASE_URL and no network.
//
// The AI here is a DIFF ENGINE, not a therapist: it narrates a comparison of
// the user's own frozen text against the outcome. It never scores anything.

import { BASELINE_BRIER, brierScore } from "@/lib/scoring";
import type { Stance } from "@/lib/predictions/stance";

/**
 * Hard character budget for each free-text field fed into the post-mortem
 * prompt. The journal reframe (docs 04 §4–5) enlarges `reasoning` and
 * `outcome_note` into full text areas with no UI length limit, so a single
 * long entry could otherwise blow the per-call token cap. We truncate on
 * INPUT here — never in the UI — and mark the clip. Kept as one exported
 * constant so the embedding step (docs 04 §6, Session 19) caps identically.
 */
export const POSTMORTEM_EXCERPT_CHAR_BUDGET = 1500;

/** Clip a free-text field to the excerpt budget, marking truncation with an ellipsis. */
export function excerpt(text: string, budget = POSTMORTEM_EXCERPT_CHAR_BUDGET): string {
  return text.length <= budget ? text : text.slice(0, budget) + "…";
}

/**
 * The diff-engine constraint. Kept as a stable constant so it can be
 * prompt-cached on the static system block (docs §9.7). Every rule here is an
 * eval rubric item (docs §16): claims must anchor to user text; no motives.
 */
export const POSTMORTEM_SYSTEM_PROMPT = `You are a calibration diff engine, not a therapist or a coach. You are given a user's own frozen prediction, the reasoning they wrote BEFORE the outcome was known, and what actually happened. Your only job is to diff their stated reasoning against reality.

Hard rules:
- Every claim you make MUST anchor to text the user actually wrote — their prediction, their reasoning, their plan/what-would-change-my-mind field, their outcome note, or their reflection. Quote or paraphrase their words. Do not invent facts, causes, or motives, and never invent a number that isn't already given to you.
- Never speculate about WHY they think the way they do, their psychology, or their character. No armchair analysis.
- If the outcome note names a factor their reasoning never mentioned, say so plainly ("your reasoning didn't mention X, which your note says decided it").
- If their "what would change my mind" field named the very thing that happened, credit it explicitly.
- If a reflection is provided, it is the user's own self-report, knowing the outcome — quote or reference it, but never endorse it ("you were right to feel that way") or contradict it ("you should actually feel differently"). Do not judge the decision itself as good, bad, wise, or a mistake — report what they said, nothing more.
- If a stance is provided, treat it the same way: state it as their own answer, never as a grade you are assigning or agreeing with.
- If similar past misses are provided and reveal a recurring blind spot, name the pattern in one sentence, grounded in the shared text.
- Do NOT restate the Brier score or any number as a judgment — the deterministic engine already scored them. You explain the reasoning gap, not the grade.

Format: 2-4 short sentences, plain and direct. No preamble, no headings, no bullet points, no sign-off.`;

/** Maps the stance enum to a plain self-report phrase for the prompt — the
 * post-mortem reports this as the user's own answer, never a grade. */
const STANCE_PROMPT_LABEL: Record<Stance, string> = {
  stand_by: "they said they'd stand by it",
  mixed: "they said they feel mixed about it",
  wouldnt_again: "they said they wouldn't do it again",
};

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
  /** The decision layer's "knowing what you know now" free text (docs §2.2/§2.3). Null for
   * legacy forecast rows and for decision entries where the user left it blank. */
  reflection: string | null;
  /** The decision layer's one-tap stance, same nullability as `reflection`. */
  stance: Stance | null;
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
    `Their reasoning: ${excerpt(inputs.reasoning)}`,
  ];

  if (inputs.planOrDisconfirm) {
    lines.push(`${secondFieldLabel}: ${inputs.planOrDisconfirm}`);
  }

  lines.push(`Actual outcome: ${inputs.outcome ? "YES — it happened" : "NO — it did not happen"}`);

  if (inputs.outcomeNote) {
    lines.push(`Their note on what happened: ${excerpt(inputs.outcomeNote)}`);
  }

  if (inputs.reflection) {
    lines.push(`Their reflection, knowing the outcome now: ${excerpt(inputs.reflection)}`);
  }

  if (inputs.stance) {
    lines.push(`Their stance, knowing the outcome now: ${STANCE_PROMPT_LABEL[inputs.stance]}`);
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

// ---------------------------------------------------------------------------
// Streaming consumption + persist (DB-free, deps injected)
//
// The degradation-critical body of the post-mortem route, extracted so its
// mid-stream-failure and empty-completion branches are unit-testable without a
// DATABASE_URL, the Anthropic SDK, or a real ReadableStream. The route builds a
// `ModelStream` adapter over `client.messages.stream(...)` and binds the real
// emit/persist/finalize; this owns the "when to persist, always finalize" logic.

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
}

/** SDK-agnostic view of a streaming completion: text deltas + final usage. */
export interface ModelStream {
  /** Yields text deltas in order. May throw mid-iteration on an API failure. */
  chunks: AsyncIterable<string>;
  /** Resolves the token usage once the stream has drained (finalMessage). */
  usage: () => Promise<StreamUsage>;
}

export interface PostmortemStreamDeps {
  /** Opens the model stream (the SDK→ModelStream adapter, in the route). */
  open: () => ModelStream;
  /** Push a text delta to the client (route: controller.enqueue). */
  emit: (text: string) => void;
  /** Persist the completed post-mortem text (route: db.update). Only on non-empty completion. */
  persist: (fullText: string) => Promise<void>;
  /** Fill the reserved ai_calls row (route: finalizeAiCall). ALWAYS called. */
  finalize: (result: { inputTokens: number; outputTokens: number; latencyMs: number }) => Promise<void>;
  /** Injectable clock for deterministic latency in tests. */
  now?: () => number;
}

/**
 * Streams the post-mortem to the client and persists it once, with graceful
 * degradation: a mid-stream API failure stops cleanly (nothing persisted, so a
 * retry regenerates — the client keeps whatever streamed). `finalize` runs in a
 * `finally` so the reserved cap slot is ALWAYS closed (0/0 tokens on failure,
 * the conservative choice for a cost cap). Resolves, never rejects.
 */
export async function consumePostmortemStream(deps: PostmortemStreamDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  const start = now();
  let full = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = deps.open();
    for await (const delta of stream.chunks) {
      full += delta;
      deps.emit(delta);
    }
    const usage = await stream.usage();
    inputTokens = usage.inputTokens;
    outputTokens = usage.outputTokens;

    // Persist once, only on a real completion — this is what makes a revisit
    // return the stored text instead of regenerating and re-charging.
    if (full.trim().length > 0) {
      await deps.persist(full);
    }
  } catch {
    // Network/API failure mid-stream (or a failed persist): stop cleanly.
    // Nothing (further) persisted, so a retry regenerates.
  } finally {
    await deps.finalize({ inputTokens, outputTokens, latencyMs: now() - start });
  }
}
