// Insights page — pure view-model assembly (docs §4.7, §8). No DB, no
// network, no AI: given a user's full resolved/void history, this decides
// every number and lock state the page renders. Unit-testable with zero
// DATABASE_URL, exactly like resolveCore.ts. The page itself does IO
// (auth, Drizzle fetch, numeric-string conversion) and rendering only — no
// score or threshold logic lives in the component tree.

import {
  BASELINE_BRIER,
  BIAS_UNLOCK_N,
  biasByGroup,
  biasScore,
  biasSentence,
  boldness,
  boldnessSentence,
  brierScore,
  brierSentence,
  bucketIndex,
  calibrationBuckets,
  CURVE_UNLOCK_N,
  ewmaBrierTrend,
  PROGRESS_UNLOCK_N,
  resolvedNonVoid,
  rollingBrier,
  runningBrier,
  type Scorable,
} from "@/lib/scoring";

/** The normalized shape the page maps DB rows into before handing them here. */
export interface InsightsInput extends Scorable {
  /** Row id — lets a chart drill-down link straight to the prediction's detail page. */
  id: string;
  /** The user's own words — shown in the chart drill-downs. */
  text: string;
  resolvedAt: Date;
  category: string | null;
  reasoningType: string | null;
}

/**
 * One resolved prediction, flattened for a chart drill-down list: enough to show
 * a row and link to its detail page, nothing more (no reasoning/post-mortem — the
 * detail page owns those, so they never ship to the client with the charts).
 */
export interface HistoryItemLite {
  id: string;
  text: string;
  /** Stated confidence in [0, 1]. */
  confidence: number;
  outcome: boolean;
  /** This single prediction's Brier — `(confidence − outcome)²`. */
  brier: number;
}

/**
 * A calibration-curve dot. `x`/`y`/`n` are exactly the scoring module's bucket
 * (what's plotted); `low`/`high` name the confidence band and `predictions` are
 * its members, so clicking the dot can list every prediction behind it.
 */
export interface CalibrationPoint {
  x: number;
  y: number;
  n: number;
  /** Inclusive lower / exclusive upper confidence bound of this decile. */
  low: number;
  high: number;
  predictions: HistoryItemLite[];
}

/**
 * A progress-chart point. `n`/`value` are the plotted rolling-Brier trajectory
 * (from the scoring module); the rest identify the individual resolution that
 * point lands on, so clicking it opens that prediction, hovering shows its text
 * and its own score, and a brushed range maps back to resolution dates.
 */
export interface ProgressPoint {
  /** 1-based count of resolutions up to and including this point (x-axis). */
  n: number;
  /** EWMA "recent form" Brier as of this resolution (the chart's Recent series). */
  value: number;
  /** Cumulative lifetime Brier over every resolution up to and including this one. */
  lifetime: number;
  predictionId: string;
  text: string;
  /** This resolution's own Brier (not the rolling or lifetime value). */
  brier: number;
  /** Resolution date (YYYY-MM-DD) — lets a brushed range become a history date filter. */
  resolvedDate: string;
}

export interface BiasBreakdownRow {
  key: string;
  n: number;
  bias: number;
  sentence: string;
}

export interface InsightsViewModel {
  /** Total resolved, non-void predictions — the shared denominator for every unlock gate below. */
  n: number;
  /** BASELINE_BRIER, threaded through so no component ever hardcodes 0.25. */
  baselineBrier: number;

  bias: {
    unlocked: boolean;
    unlockSentence: string | null;
    value: number | null;
    sentence: string | null;
    // By category only. The reasoning-type breakdown is intentionally NOT
    // surfaced — its taxonomy is internal (it drives the AI insight); the user
    // never sees a coined reasoning-style label.
    byCategory: BiasBreakdownRow[];
  };

  curve: {
    unlocked: boolean;
    unlockSentence: string | null;
    points: CalibrationPoint[];
  };

  /**
   * The Boldness gauge — how much the user's confidence levels actually sort
   * outcomes, on a 0–1 scale. Gated behind the *same* sample threshold as the
   * curve (the underlying stat is noisier at low N). `value` is null when locked
   * OR when it can't be read even with enough data (every outcome came out the
   * same way, so there's nothing to sort); `sentence` still explains that case.
   */
  boldness: {
    unlocked: boolean;
    /** "N more resolutions before this is meaningful." — null once unlocked. */
    unlockSentence: string | null;
    /** 0–1 boldness, or null when locked / not yet readable. */
    value: number | null;
    /** Directional reading of `value`, or the degenerate-history explanation. */
    sentence: string | null;
  };

  progress: {
    unlocked: boolean;
    unlockSentence: string | null;
    trend: ProgressPoint[];
    last20: number | null;
    sentence: string | null;
  };

  runningBrier: {
    value: number | null;
    sentence: string | null;
  };
}

/** "N of THRESHOLD resolutions until your SUBJECT unlocks." */
function progressCopy(current: number, threshold: number, subject: string): string {
  return `${current} of ${threshold} resolutions until your ${subject} unlocks.`;
}

function toBreakdownRows(groups: ReturnType<typeof biasByGroup>): BiasBreakdownRow[] {
  return groups.map((g) => ({ ...g, sentence: biasSentence(g.bias) }));
}

function toHistoryItem(p: InsightsInput & { outcome: boolean }): HistoryItemLite {
  return {
    id: p.id,
    text: p.text,
    confidence: p.confidence,
    outcome: p.outcome,
    brier: brierScore(p.confidence, p.outcome),
  };
}

/**
 * The scoring module's calibration buckets, each annotated with its member
 * predictions for the click-to-drill-down panel. Members are assigned via the
 * exported `bucketIndex` — the *same* decile logic the buckets were built from —
 * so a dot and its list can never disagree about which band a prediction is in.
 */
function buildCalibrationPoints(
  resolved: Array<InsightsInput & { outcome: boolean }>,
): CalibrationPoint[] {
  const membersByIndex = new Map<number, HistoryItemLite[]>();
  for (const p of resolved) {
    const idx = bucketIndex(p.confidence);
    const members = membersByIndex.get(idx);
    if (members) members.push(toHistoryItem(p));
    else membersByIndex.set(idx, [toHistoryItem(p)]);
  }

  return calibrationBuckets(resolved).map((b) => ({
    x: b.meanConfidence,
    y: b.actualFrequency,
    n: b.n,
    low: b.low,
    high: b.high,
    predictions: membersByIndex.get(b.index) ?? [],
  }));
}

/**
 * The Brier trajectory, each point tied back to the individual resolution it
 * lands on. The chart's two toggleable series:
 *  - `value` = the EWMA "recent form" (recency-weighted). A trailing window was
 *    deliberately rejected here: it equals the lifetime mean for the first 20
 *    points, so the recent/lifetime toggle looked like it did nothing. The EWMA
 *    diverges from lifetime at every point, so flipping visibly moves the whole
 *    line and every dot.
 *  - `lifetime` = the cumulative running mean of the same per-prediction Briers.
 * `ewmaBrierTrend` yields one point per resolution in the same chronological
 * order as `resolved`, so index `i` pairs it with `resolved[i]`; the lifetime
 * mean is accumulated in the same pass.
 */
function buildProgressPoints(
  resolved: Array<InsightsInput & { outcome: boolean }>,
): ProgressPoint[] {
  let cumulativeSum = 0;
  return ewmaBrierTrend(resolved).map((pt, i) => {
    const p = resolved[i]!;
    const brier = brierScore(p.confidence, p.outcome);
    cumulativeSum += brier;
    return {
      n: pt.n,
      value: pt.value,
      lifetime: cumulativeSum / (i + 1),
      predictionId: p.id,
      text: p.text,
      brier,
      resolvedDate: p.resolvedAt.toISOString().slice(0, 10),
    };
  });
}

// The scoped AI insight (docs §9.4) replaces v1's templated monthly summary: it
// lives in its own module (scopedInsightView.ts), is generated on demand rather
// than computed on every render, and its deterministic fallback is scope-based,
// not month-based — so no month recap is assembled here any more.

export function buildInsightsViewModel(preds: InsightsInput[]): InsightsViewModel {
  const resolved = resolvedNonVoid(preds);
  const n = resolved.length;

  const biasValue = biasScore(resolved);
  const biasUnlocked = n >= BIAS_UNLOCK_N;

  const curveUnlocked = n >= CURVE_UNLOCK_N;
  const points = buildCalibrationPoints(resolved);

  // Boldness rides the curve's gate. `boldness()` also returns null when the
  // history has enough data but no outcome variety (all YES / all NO) — a real
  // state we narrate rather than hide, so the card never shows a blank number.
  const boldnessUnlocked = n >= CURVE_UNLOCK_N;
  const boldnessValue = boldness(resolved);
  const boldnessSentenceText =
    boldnessValue !== null
      ? boldnessSentence(boldnessValue)
      : boldnessUnlocked
        ? "Every prediction so far resolved the same way — there's nothing yet for your confidence to sort."
        : null;

  const progressUnlocked = n >= PROGRESS_UNLOCK_N;
  const trend = buildProgressPoints(resolved);
  const last20 = rollingBrier(resolved, 20);
  const lifetime = runningBrier(resolved);

  const runningValue = runningBrier(resolved);

  return {
    n,
    baselineBrier: BASELINE_BRIER,

    bias: {
      unlocked: biasUnlocked,
      unlockSentence: biasUnlocked ? null : progressCopy(n, BIAS_UNLOCK_N, "bias score"),
      value: biasValue,
      sentence: biasValue === null ? null : biasSentence(biasValue),
      byCategory: toBreakdownRows(biasByGroup(resolved, (p) => p.category)),
    },

    curve: {
      unlocked: curveUnlocked,
      unlockSentence: curveUnlocked ? null : progressCopy(n, CURVE_UNLOCK_N, "curve"),
      points,
    },

    boldness: {
      unlocked: boldnessUnlocked,
      unlockSentence: boldnessUnlocked
        ? null
        : `${CURVE_UNLOCK_N - n} more resolution${CURVE_UNLOCK_N - n === 1 ? "" : "s"} before this is meaningful.`,
      value: boldnessValue,
      sentence: boldnessSentenceText,
    },

    progress: {
      unlocked: progressUnlocked,
      unlockSentence: progressUnlocked ? null : progressCopy(n, PROGRESS_UNLOCK_N, "progress chart"),
      trend,
      last20,
      sentence:
        last20 === null || lifetime === null
          ? null
          : `Last 20: ${last20.toFixed(2)} vs ${lifetime.toFixed(2)} lifetime.`,
    },

    runningBrier: {
      value: runningValue,
      sentence: runningValue === null ? null : brierSentence(runningValue),
    },
  };
}
