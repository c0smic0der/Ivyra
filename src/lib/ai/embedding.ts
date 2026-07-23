// Embedding provider — shared by capture-time enrichment (enrich.ts) and the
// draft-time track-record embed (trackRecordAction.ts). Both need the same
// vector shape over the same kind of text, so the call lives in one place.
//
// Provider: OpenAI `text-embedding-3-small`. Chosen because its default output
// dimension (1536) matches `predictions.embedding vector(1536)` exactly — no
// schema change. We pass `dimensions: 1536` explicitly so a future default
// change on OpenAI's side can't silently produce a mismatched vector.
//
// Server-side only: reads OPENAI_API_KEY from the environment and is imported
// exclusively from Server Actions / route handlers / scripts. Uses `fetch`
// directly (no SDK dependency) — one POST, a tiny response.
//
// Degradation contract: NEVER throws. Any failure (missing key, non-200,
// network error, wrong-length vector) returns null. Every caller already
// null-degrades — enrichment leaves the embedding column null; the track-record
// panel falls through to the static base-rate line; the post-mortem skips its
// similar-misses cross-reference — so a null here is always safe, never an error.

export const EMBEDDING_DIMENSIONS = 1536;
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

// $0.02 per 1M tokens (text-embedding-3-small). Distinct from the Haiku rates
// in anthropic.ts — embeddings are ~50x cheaper per input token, so cost for an
// embedding call must NOT be derived from the Haiku rate logAiCall assumes.
export const EMBEDDING_INPUT_COST_PER_TOKEN = 0.02 / 1_000_000;

/** Cost (USD, 6dp string for the numeric column) of an embedding call. */
export function embeddingCostUsd(inputTokens: number): string {
  return (inputTokens * EMBEDDING_INPUT_COST_PER_TOKEN).toFixed(6);
}

const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export interface EmbedResult {
  embedding: number[];
  inputTokens: number;
}

/** The text we actually embed: prediction plus reasoning when present. */
function embedInput(text: string, reasoning: string | null): string {
  return reasoning ? `${text}\n\n${reasoning}` : text;
}

/**
 * Embed prediction (+ reasoning) and report token usage for cost logging.
 * Returns null on ANY failure — missing key, non-2xx, network error, malformed
 * body, or a vector whose length isn't EMBEDDING_DIMENSIONS (a wrong-shaped
 * vector would corrupt the pgvector column, so we reject rather than store it).
 *
 * `fetchImpl` is injected so tests exercise every branch with zero network,
 * mirroring the callModel injection in enrichCore.ts.
 */
export async function embedTextWithUsage(
  text: string,
  reasoning: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<EmbedResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // No key configured — degrade silently. Capture/track-record still work.
    return null;
  }

  try {
    const response = await fetchImpl(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_EMBEDDING_MODEL,
        input: embedInput(text, reasoning),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as {
      data?: { embedding?: number[] }[];
      usage?: { prompt_tokens?: number };
    };

    const embedding = json.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      return null;
    }

    return {
      embedding,
      inputTokens: json.usage?.prompt_tokens ?? 0,
    };
  } catch {
    // Network error, aborted request, malformed JSON — all degrade to null.
    return null;
  }
}

/**
 * Vector-only convenience wrapper, preserving the original seam signature so
 * callers that don't do their own cost logging (the enrichAndPersist default
 * embed dep) stay unchanged.
 */
export async function embedText(text: string, reasoning: string | null): Promise<number[] | null> {
  const result = await embedTextWithUsage(text, reasoning);
  return result?.embedding ?? null;
}
