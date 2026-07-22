import type Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { enrichOutputSchema, enrichTool, type EnrichOutput } from "@/lib/ai/enrichSchema";

// Deliberately DB-free: everything here is pure or talks only to the
// Anthropic API (via an injectable call function), so it's unit-testable
// with zero network calls and no DATABASE_URL. `enrich.ts` wraps this with
// the DB-touching orchestration (cap counting, ai_calls logging, the update).

export const DAILY_AI_CALL_CAP = 25;

/** Pure boundary check. */
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

/**
 * Stub. Day 6 (track-record surfacing) replaces this with a real embedding
 * call over prediction+reasoning text for pgvector similarity search. Until
 * then `predictions.embedding` stays null. Deliberately does NOT log to
 * ai_calls — there is no real call made here to log.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches the real Day 6 implementation
export async function embedPrediction(_text: string, _reasoning: string | null): Promise<null> {
  return null;
}
