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

export async function logAiCall(params: {
  userId: string;
  predictionId: string | null;
  purpose: "enrich" | "postmortem" | "monthly_insight" | "reference_class" | "track_record_embed";
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}): Promise<void> {
  const costUsd =
    params.inputTokens * HAIKU_INPUT_COST_PER_TOKEN + params.outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;
  await db.insert(schema.aiCalls).values({
    userId: params.userId,
    predictionId: params.predictionId,
    purpose: params.purpose,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: costUsd.toFixed(6),
    latencyMs: params.latencyMs,
  });
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
