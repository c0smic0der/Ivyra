import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  embeddingCostUsd,
  embedTextWithUsage,
  OPENAI_EMBEDDING_MODEL,
  type EmbedResult,
} from "@/lib/ai/embedding";
import { logAiCall } from "@/lib/ai/enrich";
import { backfillEmbeddings, type BackfillResult } from "@/lib/ai/backfillCore";

// DB binding for the embedding backfill. Selects rows still missing an embedding
// (`embedding IS NULL`) — the source of idempotency: an already-embedded row is
// never selected, so a re-run neither re-embeds it nor logs a second ai_calls
// row. The persist below re-asserts the same guard, so even a concurrent run
// can't overwrite a vector. The pure loop lives in backfillCore.ts.

export interface BackfillOptions {
  /** Restrict to one user (the seed backfills only the demo account); omit for all rows. */
  userId?: string;
  /** Override the embed call in tests (real default: embedTextWithUsage, capped-excerpt + logged). */
  embed?: (text: string, reasoning: string | null) => Promise<EmbedResult | null>;
  now?: () => number;
  onProgress?: (line: string) => void;
}

/**
 * Embed every prediction that still lacks a vector (optionally scoped to one
 * user) and store it, logging each call to ai_calls with purpose 'backfill_embed'.
 * Idempotent by row selection + the persist guard. Returns the run counts.
 */
export async function backfillMissingEmbeddings(opts: BackfillOptions = {}): Promise<BackfillResult> {
  const rows = await db
    .select({
      id: schema.predictions.id,
      userId: schema.predictions.userId,
      text: schema.predictions.text,
      reasoning: schema.predictions.reasoning,
    })
    .from(schema.predictions)
    .where(
      opts.userId
        ? and(isNull(schema.predictions.embedding), eq(schema.predictions.userId, opts.userId))
        : isNull(schema.predictions.embedding),
    );

  return backfillEmbeddings(rows, {
    embed: opts.embed ?? embedTextWithUsage,
    // The `isNull(embedding)` guard makes the write idempotent: a row already
    // embedded (e.g. by a concurrent run) matches zero rows here, never clobbered.
    persistEmbedding: (id, embedding) =>
      db
        .update(schema.predictions)
        .set({ embedding })
        .where(and(eq(schema.predictions.id, id), isNull(schema.predictions.embedding)))
        .then(() => undefined),
    logCall: (row, usage) =>
      logAiCall({
        userId: row.userId,
        predictionId: row.id,
        purpose: "backfill_embed",
        model: OPENAI_EMBEDDING_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: 0,
        costUsd: embeddingCostUsd(usage.inputTokens),
        latencyMs: usage.latencyMs,
      }),
    now: opts.now,
    onProgress: opts.onProgress,
  });
}
