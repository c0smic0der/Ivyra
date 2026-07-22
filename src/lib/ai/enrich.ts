import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { HAIKU_INPUT_COST_PER_TOKEN, HAIKU_MODEL, HAIKU_OUTPUT_COST_PER_TOKEN } from "@/lib/ai/anthropic";
import { embedText } from "@/lib/ai/embedding";
import { isUnderDailyCap, runEnrichWithRepair, type EnrichWithRepairResult } from "@/lib/ai/enrichCore";
import type { EnrichOutput } from "@/lib/ai/enrichSchema";

// DB-touching orchestration for capture-time enrichment. The pure/injectable
// logic (cap boundary check, repair-retry) lives in enrichCore.ts so it can
// be unit-tested without a DATABASE_URL or any network access.

export async function countAiCallsToday(userId: string): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.aiCalls)
    .where(and(eq(schema.aiCalls.userId, userId), gte(schema.aiCalls.createdAt, startOfDayUtc)));
  return result?.count ?? 0;
}

type AiCallPurpose =
  | "enrich"
  | "postmortem"
  | "monthly_insight"
  | "reference_class"
  | "track_record_embed";

function costFor(inputTokens: number, outputTokens: number): string {
  return (
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN
  ).toFixed(6);
}

export async function logAiCall(params: {
  userId: string;
  predictionId: string | null;
  purpose: AiCallPurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}): Promise<void> {
  await db.insert(schema.aiCalls).values({
    userId: params.userId,
    predictionId: params.predictionId,
    purpose: params.purpose,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: costFor(params.inputTokens, params.outputTokens),
    latencyMs: params.latencyMs,
  });
}

/**
 * Reserve a cap slot BEFORE a long-running (streamed) call, returning the row
 * id. Inserting up front means `countAiCallsToday` sees this call in-flight, so
 * concurrent requests can't all pass the gate against a stale pre-call count.
 * The row starts at 0 tokens / 0 cost; `finalizeAiCall` fills real usage when
 * the call completes. (Narrows the TOCTOU window to the gap between the count
 * and this insert; the fully-atomic conditional-insert cap is docs/TODO.md.)
 */
export async function reserveAiCall(params: {
  userId: string;
  predictionId: string | null;
  purpose: AiCallPurpose;
  model: string;
}): Promise<string> {
  const [row] = await db
    .insert(schema.aiCalls)
    .values({
      userId: params.userId,
      predictionId: params.predictionId,
      purpose: params.purpose,
      model: params.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0.000000",
      latencyMs: 0,
    })
    .returning({ id: schema.aiCalls.id });
  return row.id;
}

/** Fill a reserved ai_calls row with the real token counts, cost, and latency. */
export async function finalizeAiCall(
  id: string,
  params: { inputTokens: number; outputTokens: number; latencyMs: number },
): Promise<void> {
  await db
    .update(schema.aiCalls)
    .set({
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd: costFor(params.inputTokens, params.outputTokens),
      latencyMs: params.latencyMs,
    })
    .where(eq(schema.aiCalls.id, id));
}

/** Fired from actions.ts via after() — never blocks the initial row write. */
export async function enrichPrediction(params: {
  userId: string;
  predictionId: string;
  text: string;
  reasoning: string | null;
}): Promise<void> {
  const callsToday = await countAiCallsToday(params.userId);
  if (!isUnderDailyCap(callsToday)) {
    // Over cap: skip enrichment gracefully. The row already saved and stays
    // fully usable with category/reasoningType/embedding left null.
    return;
  }

  const start = Date.now();
  let output: EnrichOutput | null = null;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  try {
    const result: EnrichWithRepairResult = await runEnrichWithRepair(params.text, params.reasoning);
    output = result.output;
    totalInputTokens = result.totalInputTokens;
    totalOutputTokens = result.totalOutputTokens;
  } catch {
    // Network/API failure: degrade gracefully. Still log the attempt below
    // (0/0 tokens) so the cap-counting query reflects it happened.
  }
  const latencyMs = Date.now() - start;

  await logAiCall({
    userId: params.userId,
    predictionId: params.predictionId,
    purpose: "enrich",
    model: HAIKU_MODEL,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    latencyMs,
  });

  const embedding = await embedText(params.text, params.reasoning);

  await db
    .update(schema.predictions)
    .set({
      category: output?.category ?? null,
      reasoningType: output?.reasoning_type ?? null,
      embedding,
    })
    .where(and(eq(schema.predictions.id, params.predictionId), eq(schema.predictions.userId, params.userId)));
}
