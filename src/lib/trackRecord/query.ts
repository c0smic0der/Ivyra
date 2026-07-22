import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { SIMILARITY_THRESHOLD, type SimilarMatch } from "@/lib/trackRecord/matching";

// DB-touching only — no unit tests here, same convention as enrich.ts (the
// pure decision logic it feeds lives in matching.ts and is fully tested).
//
// The app's Drizzle client connects via a privileged DATABASE_URL that
// bypasses RLS entirely (see src/db/migrations/0000_init.sql's own comment).
// The `eq(predictions.userId, userId)` filter below is therefore mandatory,
// not defense-in-depth — it's the only thing standing between one user's
// track record and another's.

/**
 * pgvector cosine similarity search over the given user's own resolved,
 * non-void predictions. Returns rows at/above `threshold`, most similar
 * first. Gating on MIN_MATCHES happens in matching.ts, not here.
 */
export async function findSimilarResolvedPredictions(
  userId: string,
  draftEmbedding: number[],
  threshold: number = SIMILARITY_THRESHOLD,
  limit: number = 20,
): Promise<SimilarMatch[]> {
  const similarity = sql<number>`1 - (${cosineDistance(schema.predictions.embedding, draftEmbedding)})`;

  const rows = await db
    .select({
      text: schema.predictions.text,
      confidence: schema.predictions.confidence,
      outcome: schema.predictions.outcome,
      resolvedAt: schema.predictions.resolvedAt,
      similarity,
    })
    .from(schema.predictions)
    .where(
      and(
        eq(schema.predictions.userId, userId),
        eq(schema.predictions.status, "resolved"),
        isNotNull(schema.predictions.embedding),
        sql`${similarity} >= ${threshold}`,
      ),
    )
    .orderBy(sql`${similarity} desc`)
    .limit(limit);

  return rows.map((row) => ({
    text: row.text,
    confidence: Number(row.confidence),
    outcome: row.outcome ?? false,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : "",
    similarity: Number(row.similarity),
  }));
}
