// Track-record panel — pure math (§9.2, docs/04-journal-reframe §3.3). No DB, no
// network, no AI: given a set of pgvector-matched rows (already similarity-gated
// by query.ts) and the confidence the user is about to commit, this decides
// whether there's enough signal to show a personal track record and computes the
// exact frequency shown. The AI, if ever involved, only embeds the draft (see
// src/lib/ai/embedding.ts) — it never touches these numbers.
//
// These functions are deliberately pure so the panel can recompute LIVE as the
// confidence slider moves without re-embedding (embedding depends only on the
// draft text; only the band selection depends on confidence).

export const SIMILARITY_THRESHOLD = 0.75;
export const MIN_MATCHES = 3;
/** Confidence bands are 5-point steps, so the sentence never reads "82% or higher". */
export const BAND_STEP = 5;

export interface SimilarMatch {
  text: string;
  /** Stated confidence in [0, 1]. */
  confidence: number;
  outcome: boolean;
  resolvedAt: string;
  /** Cosine similarity to the draft, in [0, 1] (1 - cosine distance). */
  similarity: number;
}

export interface BandTrackRecord {
  /** The band actually reported, a multiple of BAND_STEP, e.g. 75. */
  bandPercent: number;
  /** How many similar calls were made at bandPercent or higher (n ≥ MIN_MATCHES). */
  count: number;
  /** How many of those `count` calls landed (outcome true). */
  landed: number;
}

/** Round a 0–1 confidence to an integer percent. Bands are integers, so compare
 * on the rounded percent to avoid float noise (0.75*100 ≠ exactly 75). */
function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}

/** Floor a percent to the nearest band step (82 → 80, 75 → 75). */
export function bandFloor(percent: number): number {
  return Math.floor(percent / BAND_STEP) * BAND_STEP;
}

/**
 * Select the band to report, per docs/04-journal-reframe §3.3:
 *  1. Start at the band of the confidence the user is about to commit (floored
 *     to BAND_STEP).
 *  2. If fewer than MIN_MATCHES similar calls were made at that band or higher,
 *     WIDEN DOWNWARD to the highest band that does clear MIN_MATCHES.
 *  3. If no band down to BAND_STEP reaches MIN_MATCHES, return null — the caller
 *     falls back to the static base-rate line.
 *
 * Because n(band) only grows as the band lowers, iterating from the start band
 * downward and returning the first qualifying band yields the HIGHEST qualifying
 * band ≤ the start band — never the floor of the whole set. `matches` must
 * already be similarity-gated (query.ts does that); this counts by band only.
 */
export function selectBandTrackRecord(
  matches: SimilarMatch[],
  currentConfidencePercent: number,
  minMatches: number = MIN_MATCHES,
): BandTrackRecord | null {
  const startBand = bandFloor(currentConfidencePercent);
  for (let band = startBand; band >= BAND_STEP; band -= BAND_STEP) {
    const atBand = matches.filter((m) => confidencePercent(m.confidence) >= band);
    if (atBand.length >= minMatches) {
      return {
        bandPercent: band,
        count: atBand.length,
        landed: atBand.reduce((sum, m) => sum + (m.outcome ? 1 : 0), 0),
      };
    }
  }
  return null;
}

/**
 * "You've said 75% or higher on 6 calls like this. 2 landed."
 * States a frequency and stops — no average, no advice, no merit (CLAUDE.md
 * copy rule). Singular "call" when count is 1.
 */
export function bandTrackRecordSentence(tr: BandTrackRecord): string {
  const calls = tr.count === 1 ? "call" : "calls";
  return `You've said ${tr.bandPercent}% or higher on ${tr.count} ${calls} like this. ${tr.landed} landed.`;
}

/**
 * The thin-history fallback line, stated plainly as a general outside view — NOT
 * the user's own record — so nobody mistakes it for personal history (§3.3).
 * Frequency only; no advice, no merit.
 */
export function baseRateFallbackSentence(ratePercent: number): string {
  return `Not enough similar calls of your own yet — in general, things like this happen about ${ratePercent}% of the time.`;
}
