// Insights page — pure view-model assembly (docs §4.7, §8). No DB, no
// network, no AI: given a user's full resolved/void history, this decides
// every number and lock state the page renders. Unit-testable with zero
// DATABASE_URL, exactly like resolveCore.ts. The page itself does IO
// (auth, Drizzle fetch, numeric-string conversion) and rendering only — no
// score or threshold logic lives in the component tree.

import {
  BASELINE_BRIER,
  BIAS_UNLOCK_N,
  biasScore,
  biasSentence,
  boldness,
  boldnessSentence,
  brierScore,
  brierSentence,
  bucketIndex,
  calibrationBuckets,
  calibrationByGroup,
  CURVE_UNLOCK_N,
  ewmaBrierTrend,
  outcomeByStance,
  PROGRESS_UNLOCK_N,
  resolvedNonVoid,
  rollingBrier,
  runningBrier,
  type DecisionScorable,
  type StanceStats,
} from "@/lib/scoring";

/** The normalized shape the page maps DB rows into before handing them here. */
export interface InsightsInput extends DecisionScorable {
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

/**
 * One row of the "where the overconfidence lives" category breakdown. Carries
 * the whole per-category calibration picture (not just the signed bias) so the
 * bar can be sized and the hover line — "n=9 · says 81% · lands 48%" — reads
 * straight from these figures, all produced by `calibrationByGroup` in the
 * scoring module.
 */
export interface CategoryBiasRow {
  key: string;
  n: number;
  /** `meanConfidence − hitRate`; positive ⇒ overconfident in this category. */
  bias: number;
  meanConfidence: number;
  hitRate: number;
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
    // never sees a coined reasoning-style label. Sorted by |bias| descending —
    // where the overconfidence lives, loudest first.
    byCategory: CategoryBiasRow[];
  };

  curve: {
    unlocked: boolean;
    unlockSentence: string | null;
    points: CalibrationPoint[];
    /** One shared reading of the whole curve (dots below/above the line), or null when locked. */
    caption: string | null;
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

  /**
   * The decisions section (docs §2.3) — the outcome × stance cross, the ONE
   * decision-layer analytic that ships UI (`byEntryType` stays built and
   * tested but unrendered, by decision). `met`/`missed` are `outcomeByStance`'s
   * own per-group gate, so a group is `null` — not a misleading zero — until it
   * clears `BIAS_UNLOCK_N` independently; the section as a whole is unlocked
   * only once BOTH sides are readable, since the sentence quotes both at once.
   */
  decisions: {
    unlocked: boolean;
    unlockSentence: string | null;
    met: StanceStats | null;
    missed: StanceStats | null;
    /** "Of decisions where your criterion was met, you'd make X% again. Where it wasn't, Y%." — null while locked. */
    sentence: string | null;
  };
}

/** "N of THRESHOLD resolutions until your SUBJECT unlocks." */
function progressCopy(current: number, threshold: number, subject: string): string {
  return `${current} of ${threshold} resolutions until your ${subject} unlocks.`;
}

/**
 * The per-category calibration rows for the breakdown, sorted by absolute bias
 * descending (largest miscalibration first). Built from `calibrationByGroup`
 * (not `biasByGroup`) so each row carries the hit rate and mean confidence the
 * hover line reads from — the scoring module computes every figure.
 */
function toCategoryRows(rows: ReturnType<typeof calibrationByGroup>): CategoryBiasRow[] {
  return rows
    .map((r) => ({
      key: r.key,
      n: r.n,
      bias: r.bias,
      meanConfidence: r.meanConfidence,
      hitRate: r.hitRate,
    }))
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));
}

/** Buckets within this of the diagonal read as "on the line" (float/noise guard). */
const CURVE_CAPTION_EPS = 0.005;

/**
 * One shared reading of the whole calibration curve for the caption under the
 * evidence band: are more of the user's confidence bands landing below the
 * diagonal (things happen less often than stated) or above it? Counts buckets,
 * states the frequency relationship, and stops (CLAUDE.md copy rule) — never
 * evaluates whether any call was good. `null` for an empty curve.
 */
export function curveCaption(points: CalibrationPoint[]): string | null {
  if (points.length === 0) return null;
  const total = points.length;
  const below = points.filter((p) => p.y < p.x - CURVE_CAPTION_EPS).length;
  const above = points.filter((p) => p.y > p.x + CURVE_CAPTION_EPS).length;
  if (below > above) {
    return `In ${below} of your ${total} confidence bands, things happened less often than you said — those dots sit below the line.`;
  }
  if (above > below) {
    return `In ${above} of your ${total} confidence bands, things happened more often than you said — those dots sit above the line.`;
  }
  return "Your dots sit about evenly above and below the line — your stated confidence and how often things happen track each other.";
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

/**
 * The decisions section's one sentence (docs §2.3): reports the frequency of
 * the user's own "stand by it" stance, split by whether their criterion was
 * met or missed. States two frequencies and stops (CLAUDE.md copy rule) — it
 * never says whether standing by, or not, was the right call.
 */
function decisionsSentence(met: StanceStats, missed: StanceStats): string {
  const metPct = Math.round(met.standByRate * 100);
  const missedPct = Math.round(missed.standByRate * 100);
  return `Of decisions where your criterion was met, you'd make ${metPct}% again. Where it wasn't, ${missedPct}%.`;
}

/**
 * The decisions section's lock-state message. Reports both sides' real counts
 * against `BIAS_UNLOCK_N` — never a single combined total, which could read as
 * "21 of 20" while still locked (one side can clear the gate alone; the
 * section needs both, since its one sentence quotes both at once).
 */
function decisionsUnlockSentence(metCount: number, missedCount: number): string {
  return `${metCount} of ${BIAS_UNLOCK_N} met · ${missedCount} of ${BIAS_UNLOCK_N} missed — both need ${BIAS_UNLOCK_N} decisions with a recorded stance before this unlocks.`;
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

  // outcomeByStance gates `met`/`missed` independently at BIAS_UNLOCK_N; the
  // section reads as one sentence quoting both sides, so it only unlocks once
  // BOTH groups clear the gate. The lock-state counts (never a rate) are the
  // same eligible population (real verdict + recorded stance) `outcomeByStance`
  // draws `met`/`missed` from, split the same way it splits them.
  const stance = outcomeByStance(preds);
  const decisionsUnlocked = stance.met !== null && stance.missed !== null;
  const eligibleForDecisions = resolved.filter((p) => p.decision != null && p.stance != null);
  const metEligibleCount = eligibleForDecisions.filter((p) => p.outcome === true).length;
  const missedEligibleCount = eligibleForDecisions.filter((p) => p.outcome === false).length;

  return {
    n,
    baselineBrier: BASELINE_BRIER,

    bias: {
      unlocked: biasUnlocked,
      unlockSentence: biasUnlocked ? null : progressCopy(n, BIAS_UNLOCK_N, "bias score"),
      value: biasValue,
      sentence: biasValue === null ? null : biasSentence(biasValue),
      byCategory: toCategoryRows(calibrationByGroup(resolved, (p) => p.category)),
    },

    curve: {
      unlocked: curveUnlocked,
      unlockSentence: curveUnlocked ? null : progressCopy(n, CURVE_UNLOCK_N, "curve"),
      points,
      caption: curveUnlocked ? curveCaption(points) : null,
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

    decisions: {
      unlocked: decisionsUnlocked,
      unlockSentence: decisionsUnlocked
        ? null
        : decisionsUnlockSentence(metEligibleCount, missedEligibleCount),
      met: stance.met,
      missed: stance.missed,
      sentence: decisionsUnlocked ? decisionsSentence(stance.met!, stance.missed!) : null,
    },
  };
}
