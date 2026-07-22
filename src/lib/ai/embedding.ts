// Embedding provider — shared by capture-time enrichment (enrich.ts) and the
// draft-time track-record embed (trackRecordAction.ts). Both need the same
// vector shape over the same kind of text, so the call lives in one place.
//
// STUB: no embedding provider is wired up yet. When it lands, this calls
// OpenAI's `text-embedding-3-small` (POST https://api.openai.com/v1/embeddings,
// model: "text-embedding-3-small", input: text (+ reasoning)) using an
// OPENAI_API_KEY env var, returning the 1536-dim vector. Chosen because its
// default output dimension matches `predictions.embedding vector(1536)`
// exactly — no schema change needed. Until then this returns null and every
// caller degrades gracefully (enrichment skips the embedding column; the
// track-record panel falls through to the base-rate fallback).

export const EMBEDDING_DIMENSIONS = 1536;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature matches the real implementation
export async function embedText(_text: string, _reasoning: string | null): Promise<number[] | null> {
  return null;
}
