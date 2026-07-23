// One-off backfill: embeds every prediction whose `embedding` column is still
// null, so historical rows (the seeded demo account, plus any pre-embedding
// rows in your own history) become visible to pgvector similarity search — the
// track-record panel and the post-mortem's similar-misses cross-reference.
//
// RESUMABLE: the row selection is `embedding IS NULL`, and each row is written
// the moment its vector returns. If the run dies partway (or a row's embedding
// fails and stays null), re-running simply picks up the rows that are still
// null — completed rows are skipped, never re-embedded.
//
// CAP: this is an offline admin operation and deliberately BYPASSES the per-user
// daily AI cap (25/day couldn't backfill ~40 demo rows). It still logs every
// call to ai_calls (purpose 'backfill_embed') with real tokens + cost, so the
// cost dashboard stays accurate.
//
// SAFETY: prints the row count and an estimated cost, then waits for explicit
// confirmation before spending anything. Pass --yes / -y to skip the prompt
// (non-interactive runs).
//
// Usage: npm run backfill        (loads .env.local; needs DATABASE_URL + OPENAI_API_KEY)
//        npm run backfill -- --yes

import { config } from "dotenv";
config({ path: ".env.local" });

import { createInterface } from "node:readline/promises";
import { and, eq, isNull } from "drizzle-orm";
import {
  embeddingCostUsd,
  EMBEDDING_INPUT_COST_PER_TOKEN,
  embedTextWithUsage,
  OPENAI_EMBEDDING_MODEL,
} from "../src/lib/ai/embedding";

// `../src/db` reads DATABASE_URL at module load, and static imports are hoisted
// above the config() call above — so it's imported dynamically inside main(),
// after dotenv has populated the environment. (embedding.ts reads its key only
// at call time, so it's safe to import statically.)

// Rough token estimate for the pre-run cost preview only (~4 chars/token for
// English). Actual cost is computed from OpenAI's reported prompt_tokens.
function estimateTokens(text: string, reasoning: string | null): number {
  const input = reasoning ? `${text}\n\n${reasoning}` : text;
  return Math.ceil(input.length / 4);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const skipPrompt = process.argv.slice(2).some((arg) => arg === "--yes" || arg === "-y");
  const { db, schema } = await import("../src/db");

  // Only rows still missing an embedding — this is what makes re-runs resumable.
  const rows = await db
    .select({
      id: schema.predictions.id,
      userId: schema.predictions.userId,
      text: schema.predictions.text,
      reasoning: schema.predictions.reasoning,
    })
    .from(schema.predictions)
    .where(isNull(schema.predictions.embedding));

  if (rows.length === 0) {
    console.log("Nothing to do — every prediction already has an embedding.");
    return;
  }

  const estimatedTokens = rows.reduce((sum, r) => sum + estimateTokens(r.text, r.reasoning), 0);
  const estimatedCost = estimatedTokens * EMBEDDING_INPUT_COST_PER_TOKEN;

  console.log(`\nPredictions missing an embedding: ${rows.length}`);
  console.log(`Model: ${OPENAI_EMBEDDING_MODEL}`);
  console.log(`Estimated tokens: ~${estimatedTokens.toLocaleString()}`);
  console.log(`Estimated cost:   ~$${estimatedCost.toFixed(6)}\n`);

  // Show the preview above regardless, then require the key before spending.
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — set it in .env.local to run the backfill. No rows changed.");
    process.exit(1);
  }

  if (!skipPrompt) {
    const ok = await confirm("Proceed with the backfill? [y/N] ");
    if (!ok) {
      console.log("Aborted — no rows were changed.");
      return;
    }
  }

  let embedded = 0;
  let failed = 0;
  let actualTokens = 0;

  for (const [index, row] of rows.entries()) {
    const position = `[${index + 1}/${rows.length}]`;
    const start = Date.now();
    const result = await embedTextWithUsage(row.text, row.reasoning);

    if (!result) {
      failed += 1;
      console.log(`${position} FAILED (left null, will retry next run): ${row.text.slice(0, 60)}`);
      continue;
    }

    const latencyMs = Date.now() - start;

    // Write the vector, then log the call. Order matters for resumability: the
    // row's embedding is set first, so a crash before logging still leaves the
    // row done (the ai_calls row is observability, not correctness).
    await db
      .update(schema.predictions)
      .set({ embedding: result.embedding })
      .where(and(eq(schema.predictions.id, row.id), isNull(schema.predictions.embedding)));

    await db.insert(schema.aiCalls).values({
      userId: row.userId,
      predictionId: row.id,
      purpose: "backfill_embed",
      model: OPENAI_EMBEDDING_MODEL,
      inputTokens: result.inputTokens,
      outputTokens: 0,
      costUsd: embeddingCostUsd(result.inputTokens),
      latencyMs,
    });

    embedded += 1;
    actualTokens += result.inputTokens;
    console.log(`${position} embedded (${result.inputTokens} tok): ${row.text.slice(0, 60)}`);
  }

  console.log(`\nDone.`);
  console.log(`  Embedded: ${embedded}`);
  console.log(`  Failed:   ${failed}${failed > 0 ? " (still null — re-run to retry)" : ""}`);
  console.log(`  Tokens:   ${actualTokens.toLocaleString()}`);
  console.log(`  Cost:     $${embeddingCostUsd(actualTokens)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  });
