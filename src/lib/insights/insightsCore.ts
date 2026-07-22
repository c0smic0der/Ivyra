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
  brierSentence,
  calibrationBuckets,
  CURVE_UNLOCK_N,
  PROGRESS_UNLOCK_N,
  resolvedNonVoid,
  rollingBrier,
  rollingBrierTrend,
  runningBrier,
  type RollingPoint,
  type Scorable,
} from "@/lib/scoring";

/** The normalized shape the page maps DB rows into before handing them here. */
export interface InsightsInput extends Scorable {
  resolvedAt: Date;
  category: string | null;
  reasoningType: string | null;
}

export interface CalibrationPoint {
  x: number;
  y: number;
  n: number;
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
    byCategory: BiasBreakdownRow[];
    byReasoningType: BiasBreakdownRow[];
  };

  curve: {
    unlocked: boolean;
    unlockSentence: string | null;
    points: CalibrationPoint[];
  };

  progress: {
    unlocked: boolean;
    unlockSentence: string | null;
    trend: RollingPoint[];
    last20: number | null;
    sentence: string | null;
  };

  runningBrier: {
    value: number | null;
    sentence: string | null;
  };

  monthlySummary: {
    periodLabel: string;
    resolvedThisMonth: number;
    paragraph: string;
  };
}

/** "N of THRESHOLD resolutions until your SUBJECT unlocks." */
function progressCopy(current: number, threshold: number, subject: string): string {
  return `${current} of ${threshold} resolutions until your ${subject} unlocks.`;
}

function toBreakdownRows(groups: ReturnType<typeof biasByGroup>): BiasBreakdownRow[] {
  return groups.map((g) => ({ ...g, sentence: biasSentence(g.bias) }));
}

/** Start of `date`'s UTC calendar month, and the start of the following one. */
function utcMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

/**
 * Templated recap of the current UTC calendar month — the v1 stand-in for the
 * v2 batched-Haiku monthly insight (docs §9.4). Computed live on every render
 * from the same predictions as the rest of the page; does not touch the
 * `insights` table or a cron, which are provisioned for that later feature.
 * When the AI version ships, it should reuse this same month-filter + stat
 * computation and only swap the templating step for an LLM call.
 */
function buildMonthlySummary(
  preds: InsightsInput[],
  now: Date,
): InsightsViewModel["monthlySummary"] {
  const periodLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const { start, end } = utcMonthBounds(now);
  const monthRows = resolvedNonVoid(preds).filter(
    (p) => p.resolvedAt >= start && p.resolvedAt < end,
  );

  if (monthRows.length === 0) {
    return { periodLabel, resolvedThisMonth: 0, paragraph: "No resolutions yet this month." };
  }

  const brier = runningBrier(monthRows)!;
  const bias = biasScore(monthRows)!;
  return {
    periodLabel,
    resolvedThisMonth: monthRows.length,
    paragraph: `${brierSentence(brier)} ${biasSentence(bias)}`,
  };
}

export function buildInsightsViewModel(preds: InsightsInput[], now: Date): InsightsViewModel {
  const resolved = resolvedNonVoid(preds);
  const n = resolved.length;

  const biasValue = biasScore(resolved);
  const biasUnlocked = n >= BIAS_UNLOCK_N;

  const curveUnlocked = n >= CURVE_UNLOCK_N;
  const points: CalibrationPoint[] = calibrationBuckets(resolved).map((b) => ({
    x: b.meanConfidence,
    y: b.actualFrequency,
    n: b.n,
  }));

  const progressUnlocked = n >= PROGRESS_UNLOCK_N;
  const trend = rollingBrierTrend(resolved, 20);
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
      byReasoningType: toBreakdownRows(biasByGroup(resolved, (p) => p.reasoningType)),
    },

    curve: {
      unlocked: curveUnlocked,
      unlockSentence: curveUnlocked ? null : progressCopy(n, CURVE_UNLOCK_N, "curve"),
      points,
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

    monthlySummary: buildMonthlySummary(preds, now),
  };
}
