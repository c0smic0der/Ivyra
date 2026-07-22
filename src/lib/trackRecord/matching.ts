// Track-record panel — pure math (§9.2). No DB, no network, no AI: given a
// set of pgvector-matched rows, this decides whether there's enough signal
// to show a personal track record, and computes exactly what's shown. The
// AI, if ever involved, only embeds the draft (see src/lib/ai/embedding.ts)
// — it never touches these numbers.

export const SIMILARITY_THRESHOLD = 0.75;
export const MIN_MATCHES = 3;

export interface SimilarMatch {
  text: string;
  /** Stated confidence in [0, 1]. */
  confidence: number;
  outcome: boolean;
  resolvedAt: string;
  /** Cosine similarity to the draft, in [0, 1] (1 - cosine distance). */
  similarity: number;
}

export interface TrackRecordStats {
  count: number;
  avgConfidence: number;
  hitRate: number;
}

/**
 * Filters to matches at/above the similarity threshold, then requires at
 * least MIN_MATCHES to remain. Returns null when there isn't enough signal
 * to show the panel — callers fall back to the base-rate line.
 */
export function gateMatches(
  matches: SimilarMatch[],
  threshold: number = SIMILARITY_THRESHOLD,
  minMatches: number = MIN_MATCHES,
): SimilarMatch[] | null {
  const aboveThreshold = matches.filter((m) => m.similarity >= threshold);
  return aboveThreshold.length >= minMatches ? aboveThreshold : null;
}

/** Mean stated confidence and hit rate over an already-gated match set. */
export function computeTrackRecord(matches: SimilarMatch[]): TrackRecordStats {
  const count = matches.length;
  const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / count;
  const hitRate = matches.reduce((sum, m) => sum + (m.outcome ? 1 : 0), 0) / count;
  return { count, avgConfidence, hitRate };
}

/** "You've made 6 similar predictions. Avg confidence 82%. 33% came true." */
export function trackRecordSentence(stats: TrackRecordStats): string {
  const avgConfidencePercent = Math.round(stats.avgConfidence * 100);
  const hitRatePercent = Math.round(stats.hitRate * 100);
  return `You've made ${stats.count} similar predictions. Avg confidence ${avgConfidencePercent}%. ${hitRatePercent}% came true.`;
}
