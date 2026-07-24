// Calra scoring engine — v1 (Brier layer).
//
// The whole product rests on one split: *the LLM narrates, deterministic code
// grades*. Every number in here is exact, tested math — the AI never touches it.
// These are pure functions: no database, no React, no network, no AI. Callers
// convert Drizzle `numeric` strings → number before handing predictions in.
//
// v2 (Murphy decomposition, Wilson intervals) will consume these same deciles,
// so nothing here needs to change when they land. Do NOT add them yet.

export type PredictionStatus = "open" | "resolved" | "void";

/**
 * The minimal shape scoring consumes. A prediction counts toward a score only
 * when it is resolved and non-void, i.e. it carries a real YES/NO outcome.
 */
export interface Scorable {
  /** Stated confidence in [0, 1]. */
  confidence: number;
  /** Resolved result: true=YES, false=NO; null when unresolved or void. */
  outcome: boolean | null;
  /** Optional lifecycle status; when absent, a non-null outcome ⇒ resolved. */
  status?: PredictionStatus;
}

/** One decile of the calibration curve, populated (`n ≥ 1`). */
export interface Bucket {
  /** Decile index 0–9. */
  index: number;
  /** Inclusive lower confidence bound of the decile. */
  low: number;
  /** Upper confidence bound (exclusive, except the closed top bucket). */
  high: number;
  /** Nominal bucket center (index/10 + 0.05). */
  center: number;
  /** Mean stated confidence of the predictions that fell here. */
  meanConfidence: number;
  /** Observed YES frequency (hit rate) of those predictions. */
  actualFrequency: number;
  /** Number of predictions in the bucket. */
  n: number;
}

/** The Brier of an always-50% forecaster — the reference every stat compares to. */
export const BASELINE_BRIER = 0.25;

/** Resolutions needed before the Bias score headline is meaningful (insights). */
export const BIAS_UNLOCK_N = 10;
/** Resolutions needed before the calibration curve unlocks (insights). */
export const CURVE_UNLOCK_N = 30;
/** Resolutions needed before the rolling-Brier progress chart unlocks (insights). */
export const PROGRESS_UNLOCK_N = 25;

const NUM_BUCKETS = 10;

// --- internals -------------------------------------------------------------

/**
 * The single gate that excludes voids (and still-open predictions) EVERYWHERE.
 * Every aggregate runs through this, so exclusion is defined in exactly one
 * place. Exported so callers that need the same population (e.g. a resolved
 * count that must share the Brier's denominator) route through this predicate
 * instead of re-declaring it and risking drift.
 */
export function resolvedNonVoid<T extends Scorable>(preds: T[]): Array<T & { outcome: boolean }> {
  return preds.filter(
    (p): p is T & { outcome: boolean } =>
      p.status !== "void" && p.status !== "open" && p.outcome !== null,
  );
}

/** Mean of a non-empty number array. */
function mean(xs: number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/**
 * Decile index for a confidence value. `Math.floor(c * 10)` alone is unsafe:
 * 0.7 is stored slightly below 0.7, so 0.7*10 can land at 6.999… → index 6.
 * A tiny epsilon nudges exact decile boundaries up to the intended bucket
 * without moving genuinely-interior values. The top decile [0.9, 1.0] is closed,
 * so 1.0 clamps to index 9.
 *
 * Exported so callers rendering the interactive curve can assign an individual
 * prediction to *the same* decile the curve was built from. Reusing this instead
 * of re-deriving `[low, high)` membership avoids the float-drift that makes a
 * 0.7-stored-as-0.699… land in the wrong band.
 */
export function bucketIndex(confidence: number): number {
  const raw = Math.floor(confidence * NUM_BUCKETS + 1e-9);
  return Math.min(NUM_BUCKETS - 1, Math.max(0, raw));
}

// --- per-prediction --------------------------------------------------------

/**
 * Brier score for a single resolved prediction: `(confidence − outcome)²`,
 * with outcome ∈ {0, 1}. 0 is perfect, 1 is worst, 0.25 is a coin flip.
 */
export function brierScore(confidence: number, outcome: boolean | 0 | 1): number {
  const o = outcome ? 1 : 0;
  const diff = confidence - o;
  return diff * diff;
}

// --- aggregates (all exclude voids; all return null on no data) ------------

/** Mean Brier over resolved, non-void predictions. `null` if there are none. */
export function runningBrier(preds: Scorable[]): number | null {
  const resolved = resolvedNonVoid(preds);
  if (resolved.length === 0) return null;
  return mean(resolved.map((p) => brierScore(p.confidence, p.outcome)));
}

/**
 * Mean Brier over the last `window` resolved, non-void predictions — "am I
 * improving?" The lifetime average is unfair to someone who has genuinely
 * gotten better. Input order is treated as chronological; the tail is taken.
 * `null` if there are no resolutions.
 */
export function rollingBrier(preds: Scorable[], window = 20): number | null {
  const resolved = resolvedNonVoid(preds);
  if (resolved.length === 0) return null;
  const recent = resolved.slice(-window);
  return mean(recent.map((p) => brierScore(p.confidence, p.outcome)));
}

/** One point of the rolling-Brier trajectory: `value` as of the `n`th resolution. */
export interface RollingPoint {
  /** 1-based count of resolved, non-void predictions up to and including this point. */
  n: number;
  value: number;
}

/**
 * The Brier-over-time trajectory the progress chart plots: `rollingBrier` of
 * every chronological prefix of the resolved, non-void predictions. Early
 * points are effectively a running mean (fewer than `window` are available);
 * later points settle into a true trailing window. Composed directly from
 * `rollingBrier` rather than re-deriving a trailing-mean, so there is only
 * ever one implementation of "mean of a trailing window" in this module.
 * Input order is treated as chronological, same assumption as `rollingBrier`.
 */
export function rollingBrierTrend(preds: Scorable[], window = 20): RollingPoint[] {
  const resolved = resolvedNonVoid(preds);
  return resolved.map((_, i) => ({
    n: i + 1,
    value: rollingBrier(resolved.slice(0, i + 1), window)!,
  }));
}

/** Default EWMA smoothing factor: an effective span of ~9 resolutions (2/α − 1). */
export const EWMA_ALPHA = 0.2;

/**
 * Exponentially-weighted "recent form" Brier at each resolution: each point is
 * `α·thisBrier + (1−α)·previous`, seeded with the first Brier. Unlike a trailing
 * window (which equals the lifetime mean until the window fills), the EWMA
 * diverges from the cumulative average at every point after the first — so a
 * "recent vs lifetime" toggle shows two genuinely distinct trajectories instead
 * of curves that overlap for the first `window` points. Higher `alpha` = more
 * responsive. Input order is treated as chronological.
 */
export function ewmaBrierTrend(preds: Scorable[], alpha = EWMA_ALPHA): RollingPoint[] {
  const resolved = resolvedNonVoid(preds);
  let ewma: number | null = null;
  return resolved.map((p, i) => {
    const brier = brierScore(p.confidence, p.outcome);
    ewma = ewma === null ? brier : alpha * brier + (1 - alpha) * ewma;
    return { n: i + 1, value: ewma };
  });
}

/**
 * Bias: mean stated confidence − actual hit rate over resolved, non-void
 * predictions. Positive ⇒ overconfident, negative ⇒ underconfident. This is
 * the legibility stat that reads meaningfully from ~10 resolutions, before the
 * curve unlocks. `null` if there are no resolutions.
 */
export function biasScore(preds: Scorable[]): number | null {
  const resolved = resolvedNonVoid(preds);
  if (resolved.length === 0) return null;
  const meanConfidence = mean(resolved.map((p) => p.confidence));
  const hitRate = mean(resolved.map((p) => (p.outcome ? 1 : 0)));
  return meanConfidence - hitRate;
}

/** Bias score for one group (e.g. one category, one reasoning type). */
export interface GroupBias {
  key: string;
  /** Resolved, non-void count backing `bias` — the same population it was averaged over. */
  n: number;
  bias: number;
}

/**
 * `biasScore`, computed separately per group. Predictions with a null key are
 * excluded — there's nothing to attribute an ungrouped prediction to. `n` is
 * each group's resolved-non-void count (not raw group size — a void or still-
 * open row can carry a key too, and `n` must match the population `bias` was
 * actually averaged over). Groups with no resolved-non-void members (bias
 * would be null) are dropped. Sorted by `n` descending.
 */
export function biasByGroup<T extends Scorable>(
  preds: T[],
  keyFn: (pred: T) => string | null,
): GroupBias[] {
  const groups = new Map<string, T[]>();
  for (const pred of preds) {
    const key = keyFn(pred);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(pred);
    else groups.set(key, [pred]);
  }

  const rows: GroupBias[] = [];
  for (const [key, group] of groups) {
    const bias = biasScore(group);
    if (bias === null) continue;
    rows.push({ key, n: resolvedNonVoid(group).length, bias });
  }
  return rows.sort((a, b) => b.n - a.n);
}

/**
 * Calibration curve as decile buckets. Confidence is bucketed half-open
 * `[lo, hi)`, with the top decile `[0.9, 1.0]` closed so 1.0 lands. Only
 * populated buckets are returned; UI decides the sample-size lock. Buckets are
 * ordered by index ascending.
 */
export function calibrationBuckets(preds: Scorable[]): Bucket[] {
  const resolved = resolvedNonVoid(preds);
  const groups = new Map<number, Array<Scorable & { outcome: boolean }>>();
  for (const p of resolved) {
    const idx = bucketIndex(p.confidence);
    const group = groups.get(idx);
    if (group) group.push(p);
    else groups.set(idx, [p]);
  }

  return [...groups.keys()]
    .sort((a, b) => a - b)
    .map((index) => {
      const group = groups.get(index)!;
      return {
        index,
        low: index / NUM_BUCKETS,
        high: (index + 1) / NUM_BUCKETS,
        center: index / NUM_BUCKETS + 0.05,
        meanConfidence: mean(group.map((p) => p.confidence)),
        actualFrequency: mean(group.map((p) => (p.outcome ? 1 : 0))),
        n: group.length,
      };
    });
}

/**
 * Expected Calibration Error: the size-weighted average gap between each
 * bucket's mean confidence and its observed frequency. A big, wrong bucket
 * counts more than a small one. `null` if there are no resolutions.
 */
export function ece(preds: Scorable[]): number | null {
  const buckets = calibrationBuckets(preds);
  if (buckets.length === 0) return null;
  const total = buckets.reduce((sum, b) => sum + b.n, 0);
  const weighted = buckets.reduce(
    (sum, b) => sum + b.n * Math.abs(b.meanConfidence - b.actualFrequency),
    0,
  );
  return weighted / total;
}

// --- v2: Murphy decomposition ----------------------------------------------

/**
 * Murphy's three-way decomposition of the Brier score over the calibration
 * deciles. The identity `brier = uncertainty − resolution + reliability` holds
 * to float tolerance precisely because each term is computed over the *same*
 * buckets the curve is drawn from.
 */
export interface Decomposition {
  /** `b̄·(1−b̄)` — inherent difficulty of the user's question mix (uncontrollable). */
  uncertainty: number;
  /** `Σ (nₖ/N)·(freqₖ − b̄)²` — how much the user's confidence levels sort outcomes. Higher is better. */
  resolution: number;
  /** `Σ (nₖ/N)·(conf̄ₖ − freqₖ)²` — squared calibration gap of the curve, size-weighted. Lower is better. */
  reliability: number;
}

/**
 * Decompose the Brier over the v1 calibration deciles (reuses
 * `calibrationBuckets`, so voids/open are excluded through the one predicate).
 * With `b̄` the overall YES rate, `nₖ/N` each bucket's share, and `conf̄ₖ`/`freqₖ`
 * each bucket's mean confidence / observed hit rate:
 *   uncertainty = b̄·(1−b̄)
 *   resolution  = Σ (nₖ/N)·(freqₖ − b̄)²
 *   reliability = Σ (nₖ/N)·(conf̄ₖ − freqₖ)²
 *
 * The identity `brier = uncertainty − resolution + reliability` is exact only
 * when each occupied bucket holds a single confidence value; a bucket that mixes
 * confidences leaves a within-bin-variance residual (a real term, not float
 * noise). The curve's deciles are wide, so callers comparing against the raw
 * Brier should expect equality only for single-valued buckets — the test
 * fixtures are built that way deliberately.
 *
 * Ungated: returns the raw components for any resolved history (the sample-size
 * gate lives on `boldness`, the user-facing stat). `null` only when nothing is
 * resolved — never a NaN component.
 */
export function decompose(preds: Scorable[]): Decomposition | null {
  const resolved = resolvedNonVoid(preds);
  const N = resolved.length;
  if (N === 0) return null;

  const bBar = mean(resolved.map((p) => (p.outcome ? 1 : 0)));
  const buckets = calibrationBuckets(preds);

  let resolution = 0;
  let reliability = 0;
  for (const b of buckets) {
    const share = b.n / N;
    resolution += share * (b.actualFrequency - bBar) ** 2;
    reliability += share * (b.meanConfidence - b.actualFrequency) ** 2;
  }

  return { uncertainty: bBar * (1 - bBar), resolution, reliability };
}

/**
 * Boldness: `resolution / uncertainty`, clamped to [0, 1] — a user-facing 0–1
 * stat catching the honest-but-timid 50%-hugger the calibration curve alone
 * congratulates (their resolution ≈ 0). `resolution ≤ uncertainty` always holds
 * mathematically, so the clamp only guards float drift at the edges.
 *
 * Gated behind the *same* sample threshold as the calibration curve
 * (`CURVE_UNLOCK_N`) — resolution is noisier than reliability at low N, same
 * gate, no exceptions. The division is guarded when `uncertainty === 0`
 * (`b̄ ∈ {0, 1}`, an all-YES or all-NO history): `null`, never Infinity or NaN.
 */
export function boldness(preds: Scorable[]): number | null {
  if (resolvedNonVoid(preds).length < CURVE_UNLOCK_N) return null;
  const d = decompose(preds);
  if (d === null || d.uncertainty === 0) return null;
  return Math.min(1, Math.max(0, d.resolution / d.uncertainty));
}

// --- directional sentences (deterministic templates, no AI) ----------------

// How close to a boundary still reads as "on it". Tunable; kept small so the
// verdict flips only on a real move, not float noise.
const BRIER_DEADBAND = 0.005;
const BIAS_DEADBAND = 0.02; // 2 points

/** One-line reading of a Brier score, relative to the 0.25 coin-flip baseline. */
export function brierSentence(brier: number): string {
  const rounded = brier.toFixed(2);
  if (brier > BASELINE_BRIER + BRIER_DEADBAND) {
    return `A Brier of ${rounded} is worse than always guessing 50/50 — your confidence is currently subtracting information.`;
  }
  if (brier < BASELINE_BRIER - BRIER_DEADBAND) {
    return `A Brier of ${rounded} beats the 50/50 baseline — your confidence is adding information.`;
  }
  return `A Brier of ${rounded} is no better than always guessing 50/50.`;
}

/** One-line reading of a bias score, expressed in points (bias × 100). */
export function biasSentence(bias: number): string {
  if (Math.abs(bias) < BIAS_DEADBAND) {
    return "You're well calibrated overall.";
  }
  const points = Math.round(Math.abs(bias) * 100);
  const direction = bias > 0 ? "overconfident" : "underconfident";
  return `You run ${points} points ${direction}.`;
}

// Where the boldness reading flips. Below LOW, the forecaster's confidence
// levels barely separate outcomes (the 50%-hugger); at or above HEALTHY they
// carry real signal. Heuristic bands, not a theorem — kept here so the sentence
// and the gauge can never disagree about where the verdict changes. The gauge's
// track labels ("hedging" ↔ "informative") name these same two ends.
const BOLDNESS_LOW = 0.15;
const BOLDNESS_HEALTHY = 0.45;

/**
 * One-line reading of a boldness value in [0, 1] (see `boldness`). Deliberately
 * in plain English: no decomposition jargon, describing only whether the user's
 * confidence levels sort what happens from what doesn't.
 */
export function boldnessSentence(value: number): string {
  if (value < BOLDNESS_LOW) {
    return "Your confidence levels barely distinguish outcomes — you're hedging near 50/50.";
  }
  if (value < BOLDNESS_HEALTHY) {
    return "Your confidence carries some signal, but it still hugs the middle — commit harder when the evidence lets you.";
  }
  return "Your numbers carry real information — your confidence genuinely sorts what comes true from what doesn't.";
}
