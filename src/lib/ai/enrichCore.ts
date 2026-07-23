import type Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { enrichOutputSchema, enrichTool, type EnrichOutput } from "@/lib/ai/enrichSchema";

// Deliberately DB-free: everything here is pure or talks only to the
// Anthropic API (via an injectable call function), so it's unit-testable
// with zero network calls and no DATABASE_URL. `enrich.ts` wraps this with
// the DB-touching orchestration (cap counting, ai_calls logging, the update).

export const DAILY_AI_CALL_CAP = 25;

/**
 * Pure boundary check.
 *
 * TODO(atomic-cap): this read-then-act gate has a TOCTOU race — concurrent
 * requests all pass against a stale pre-call count. The post-mortem route
 * mitigates it by reserving the ai_calls row before streaming; the full fix is
 * an atomic conditional insert in the shared machinery (see docs/TODO.md).
 */
export function isUnderDailyCap(callsToday: number, cap: number = DAILY_AI_CALL_CAP): boolean {
  return callsToday < cap;
}

export interface ModelCallResult {
  toolInput: unknown;
  inputTokens: number;
  outputTokens: number;
}

/** The real Anthropic call — forced tool-use, one tool, structured output. */
export async function defaultCallModel(prompt: string): Promise<ModelCallResult> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 256,
    tools: [enrichTool],
    tool_choice: { type: "tool", name: enrichTool.name },
    messages: [{ role: "user", content: prompt }],
  });
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  return {
    toolInput: toolUseBlock?.input ?? null,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function buildEnrichPrompt(text: string, reasoning: string | null): string {
  return [
    "Classify this prediction. Call the categorize_prediction tool with your answer.",
    `Prediction: ${text}`,
    reasoning
      ? `Reasoning given: ${reasoning}`
      : "No reasoning was given — infer reasoning_type as best you can, or return null if there's no signal.",
  ].join("\n");
}

export interface EnrichWithRepairResult {
  output: EnrichOutput | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  attempts: number;
}

/**
 * One call + one repair retry. `callModel` is injected so tests never hit
 * the network — the default is the real Anthropic call.
 */
export async function runEnrichWithRepair(
  text: string,
  reasoning: string | null,
  callModel: (prompt: string) => Promise<ModelCallResult> = defaultCallModel,
): Promise<EnrichWithRepairResult> {
  const prompt = buildEnrichPrompt(text, reasoning);
  const first = await callModel(prompt);
  const firstParsed = enrichOutputSchema.safeParse(first.toolInput);
  if (firstParsed.success) {
    return {
      output: firstParsed.data,
      totalInputTokens: first.inputTokens,
      totalOutputTokens: first.outputTokens,
      attempts: 1,
    };
  }

  const repairPrompt = [
    prompt,
    `Your previous tool call was invalid: ${firstParsed.error.message}`,
    "Call the tool again with corrected arguments matching the schema exactly.",
  ].join("\n");
  const second = await callModel(repairPrompt);
  const secondParsed = enrichOutputSchema.safeParse(second.toolInput);
  return {
    output: secondParsed.success ? secondParsed.data : null,
    totalInputTokens: first.inputTokens + second.inputTokens,
    totalOutputTokens: first.outputTokens + second.outputTokens,
    attempts: 2,
  };
}

// ---------------------------------------------------------------------------
// Enrich-and-persist orchestration (DB-free, deps injected)
//
// The degradation-critical tail of capture-time enrichment, extracted here so
// its catch branches are unit-testable without a DATABASE_URL or network. The
// thin `enrichPrediction` in enrich.ts binds the real db/AI functions and keeps
// only the daily-cap gate. Every failure mode leaves the row in a consistent,
// fully-usable state (null category/reasoningType/embedding) and NEVER throws —
// this runs inside `after()`, so a throw would surface as an unhandled
// post-response rejection rather than degrade quietly.

export interface EnrichPersistFields {
  category: string | null;
  reasoningType: string | null;
  embedding: number[] | null;
}

export interface EnrichPersistDeps {
  /** The enrich call (one shot + one repair). Real default: runEnrichWithRepair. */
  runEnrich: (text: string, reasoning: string | null) => Promise<EnrichWithRepairResult>;
  /** Embedding of prediction+reasoning. Real default: embedText. May be null (stub) or throw. */
  embed: (text: string, reasoning: string | null) => Promise<number[] | null>;
  /** Log the attempt to ai_calls (0/0 tokens on failure). Always called. */
  logCall: (usage: { inputTokens: number; outputTokens: number; latencyMs: number }) => Promise<void>;
  /** Persist the enriched fields onto the prediction row. Always called. */
  persist: (fields: EnrichPersistFields) => Promise<void>;
  /** Injectable clock for deterministic latency in tests. */
  now?: () => number;
}

/**
 * Runs the enrich → log → embed → persist tail with graceful degradation:
 * - AI enrich failure → null category/reasoningType, 0/0 tokens logged.
 * - Embedding failure → null embedding (every consumer already null-degrades).
 * The attempt is ALWAYS logged (so the cap-count query reflects it) and the row
 * is ALWAYS persisted (so it never lingers half-enriched). Resolves, never rejects.
 */
export async function enrichAndPersist(
  text: string,
  reasoning: string | null,
  deps: EnrichPersistDeps,
): Promise<void> {
  const now = deps.now ?? Date.now;
  const start = now();

  let output: EnrichOutput | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const result = await deps.runEnrich(text, reasoning);
    output = result.output;
    inputTokens = result.totalInputTokens;
    outputTokens = result.totalOutputTokens;
  } catch {
    // Network/API failure: degrade. Row stays usable with null enrichment.
  }

  await deps.logCall({ inputTokens, outputTokens, latencyMs: now() - start });

  let embedding: number[] | null = null;
  try {
    embedding = await deps.embed(text, reasoning);
  } catch {
    // Embedding provider failure: degrade to no vector. Similarity-dependent
    // features (post-mortem cross-reference, track-record panel) already
    // null-degrade, so the row is still fully usable.
  }

  await deps.persist({
    category: output?.category ?? null,
    reasoningType: output?.reasoning_type ?? null,
    embedding,
  });
}
