import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { HAIKU_INPUT_COST_PER_TOKEN, HAIKU_MODEL, HAIKU_OUTPUT_COST_PER_TOKEN } from "@/lib/ai/anthropic";
import {
  embeddingCostUsd,
  embedTextWithUsage,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/ai/embedding";
import { embedAndLog, enrichAndPersist, isUnderDailyCap, runEnrichWithRepair } from "@/lib/ai/enrichCore";

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

export type AiCallPurpose =
  | "enrich"
  | "enrich_embed"
  | "postmortem"
  | "scoped_insight"
  | "monthly_insight"
  | "reference_class"
  | "track_record_embed"
  | "backfill_embed";

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
  // Explicit cost override. Anthropic calls omit it (cost derives from Haiku
  // rates); embedding calls pass their OpenAI-derived cost, since the per-token
  // rate differs by ~50x and must not be computed from the Haiku assumption.
  costUsd?: string;
}): Promise<void> {
  await db.insert(schema.aiCalls).values({
    userId: params.userId,
    predictionId: params.predictionId,
    purpose: params.purpose,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: params.costUsd ?? costFor(params.inputTokens, params.outputTokens),
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

/**
 * Fired from actions.ts via after() — never blocks the initial row write.
 * Keeps only the daily-cap gate here; the degradation-critical tail (enrich →
 * log → embed → persist) lives in the DB-free, unit-tested `enrichAndPersist`,
 * to which this binds the real db/AI functions.
 */
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

  await enrichAndPersist(params.text, params.reasoning, {
    runEnrich: runEnrichWithRepair,
    // Embedding is its own provider call (OpenAI) with its own cost, so it gets
    // its own ai_calls row via embedAndLog — logged only when a real vector
    // comes back (§9.7). Failures/nulls degrade to a null embedding column.
    embed: (text, reasoning) =>
      embedAndLog(text, reasoning, {
        embed: embedTextWithUsage,
        logCall: (usage) =>
          logAiCall({
            userId: params.userId,
            predictionId: params.predictionId,
            purpose: "enrich_embed",
            model: OPENAI_EMBEDDING_MODEL,
            costUsd: embeddingCostUsd(usage.inputTokens),
            ...usage,
          }),
      }),
    logCall: (usage) =>
      logAiCall({
        userId: params.userId,
        predictionId: params.predictionId,
        purpose: "enrich",
        model: HAIKU_MODEL,
        ...usage,
      }),
    persist: (fields) =>
      db
        .update(schema.predictions)
        .set({
          category: fields.category,
          reasoningType: fields.reasoningType,
          embedding: fields.embedding,
        })
        .where(
          and(
            eq(schema.predictions.id, params.predictionId),
            eq(schema.predictions.userId, params.userId),
          ),
        )
        .then(() => undefined),
  });
}
