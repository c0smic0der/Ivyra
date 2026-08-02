// Embedding backfill — the pure, injectable loop shared by the standalone
// `npm run backfill` and the seed's post-insert backfill. No DB, no network, no
// process I/O of its own: given a list of rows and injected embed/persist/log
// deps, it embeds each row's text + reasoning (via the SAME capped-excerpt,
// same-model path as live saves — the injected `embed` is embedTextWithUsage),
// writes the vector, and logs one ai_calls row (purpose 'backfill_embed').
//
// Idempotency lives in the CALLER: the row list is selected as `embedding IS
// NULL`, and the persist dep applies the same `isNull` guard — so a row that
// already has a vector is never in `rows`, never re-embedded, never re-logged.
// This loop just processes whatever rows it's handed, once each.
//
// NEVER throws per row on an embed failure: a null (no API key / provider down)
// leaves the row unembedded and counted as `failed`, so a re-run retries it.

import type { EmbedResult } from "@/lib/ai/embedding";

export interface BackfillRow {
  id: string;
  userId: string;
  text: string;
  reasoning: string | null;
}

export interface BackfillDeps {
  /** Usage-returning embed. Real default: embedTextWithUsage. May return null or throw. */
  embed: (text: string, reasoning: string | null) => Promise<EmbedResult | null>;
  /** Persist the vector for a row. Bound with an `embedding IS NULL` guard for idempotency. */
  persistEmbedding: (id: string, embedding: number[]) => Promise<void>;
  /** Log one ai_calls row with purpose 'backfill_embed'. Bound in backfill.ts. */
  logCall: (row: BackfillRow, usage: { inputTokens: number; latencyMs: number }) => Promise<void>;
  /** Injectable clock for deterministic latency in tests. */
  now?: () => number;
  /** Optional per-row progress line (the standalone prints it; the seed stays quiet). */
  onProgress?: (line: string) => void;
}

export interface BackfillResult {
  embedded: number;
  failed: number;
  /** Rows attempted (= rows handed in). The "of m" in "embedded n of m rows". */
  total: number;
  tokens: number;
}

export async function backfillEmbeddings(
  rows: BackfillRow[],
  deps: BackfillDeps,
): Promise<BackfillResult> {
  const now = deps.now ?? Date.now;
  let embedded = 0;
  let failed = 0;
  let tokens = 0;

  for (const [index, row] of rows.entries()) {
    const position = `[${index + 1}/${rows.length}]`;
    const start = now();

    let result: EmbedResult | null = null;
    try {
      result = await deps.embed(row.text, row.reasoning);
    } catch {
      result = null;
    }

    if (!result) {
      failed += 1;
      // ID + index/total + status ONLY — never the prediction text/reasoning
      // (CLAUDE.md logging rule: no user content to stdout/CI/logs).
      deps.onProgress?.(`${position} ${row.id} FAILED (left null, will retry next run)`);
      continue;
    }

    const latencyMs = now() - start;

    // Write the vector first, then log — the ai_calls row is observability, not
    // correctness, so a crash between them still leaves the row embedded (done).
    await deps.persistEmbedding(row.id, result.embedding);
    await deps.logCall(row, { inputTokens: result.inputTokens, latencyMs });

    embedded += 1;
    tokens += result.inputTokens;
    deps.onProgress?.(`${position} ${row.id} embedded (${result.inputTokens} tok)`);
  }

  return { embedded, failed, total: rows.length, tokens };
}
