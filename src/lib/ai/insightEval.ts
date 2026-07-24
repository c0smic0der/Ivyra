// Golden-output eval for the scoped insight (docs §16). A pure rubric that
// scores a generated insight against the three things every insight must do:
//   (a) name a pattern in the user's REASONING, not just their numbers,
//   (b) cite their own data (a real figure or a real prediction of theirs),
//   (c) prescribe a BEHAVIOR change — never merely "adjust your confidence".
// Runnable in CI on a golden fixture (see insightEval.test.ts) and reusable to
// gate live model output. No network here — it inspects text only.

import { enrichReasoningTypeValues } from "@/lib/ai/enrichSchema";
import type { ScopeStats } from "@/lib/ai/scopedInsightCore";

export interface InsightRubricInput {
  /** reasoning_type keys present in the scope (e.g. "plan_optimism"), underscored. */
  reasoningTypeKeys: string[];
  /** Rendered figures the model was given (e.g. "31%", "n=8") — the "their own data" whitelist. */
  figures: string[];
  /** The example/sample prediction titles the model was given. */
  predictionTexts: string[];
  /** What the supplied chart data actually shows — the whitelist for any chart claim. */
  chart: {
    /** Some curve bucket sits below the diagonal (hit rate < confidence). */
    curveBelowLine: boolean;
    /** Some curve bucket sits above the diagonal (hit rate > confidence). */
    curveAboveLine: boolean;
    /** Recent Brier lower than lifetime (improving); null when the progress chart is locked. */
    progressImproving: boolean | null;
  };
}

export interface InsightRubricResult {
  namesReasoningPattern: boolean;
  citesOwnData: boolean;
  /** True when the insight references at least one of the user's actual predictions (anchoring). */
  citesConcretePrediction: boolean;
  /** True when a cited rate is backed by a raw sample size ("4 of 13", "n=13"). */
  citesSampleSize: boolean;
  /** True when NO internal reasoning_type value or coined display name leaks into the prose. */
  noReasoningTypeLabel: boolean;
  /** True when the prose states no bias-point figure ("+17 points"). */
  noBiasPoints: boolean;
  /** True when every chart claim is derivable from the supplied chart data (no invented shape/trend). */
  chartClaimsSupported: boolean;
  prescribesBehavior: boolean;
  /** True when the takeaway is NOT reducible to raising/lowering the number. */
  notNumberPrescription: boolean;
  passed: boolean;
  /** Names of the checks that failed — for a legible test assertion. */
  failures: string[];
}

// The internal reasoning taxonomy, in every form that must NEVER reach the user:
// the enum values ("plan_optimism") and their humanized coinages ("plan optimism").
const REASONING_TYPE_LABELS: string[] = [
  ...enrichReasoningTypeValues,
  ...enrichReasoningTypeValues.map((v) => v.replace(/_/g, " ")),
];

// Reasoning-lens vocabulary: language that talks about *why* a prediction was
// made (or the predictions themselves), not just the score. Deliberately broad
// ("reason" matches reasoned/reasoning; "predict" matches prediction[s]) because
// a well-anchored insight expresses the pattern through examples, not jargon.
const REASONING_LENS_WORDS = ["reason", "predict", "justif", "evidence", "rationale", "because"];

// Concrete process-step cues — a change in HOW they'll decide next time. "Consider"
// / "try" are deliberately excluded: "consider lowering your confidence" is not a
// process change.
const BEHAVIOR_CUES = [
  "before you",
  "before the next",
  "before your next",
  "start from",
  "start with",
  "begin with",
  "ask who",
  "ask whether",
  "ask yourself",
  "instead of",
  "rather than",
  "when your reason",
  "when your justification",
  "when the reason",
  "next time",
  "gather",
  "check whether",
  "look at your",
  "base it on",
  "account for",
  "factor in",
  "write down",
];

// Raw sample-size forms: "4 of 13", "(4/13)", "n=13", "out of 13". Any one means
// a cited rate is grounded in a count the user can weigh, not a bare percentage.
const SAMPLE_SIZE_PATTERNS: RegExp[] = [
  /\b\d+\s+of\s+\d+\b/i,
  /\(\s*\d+\s*\/\s*\d+\s*\)/,
  /\bn\s*=\s*\d+/i,
  /\bout of\s+\d+/i,
];

// Takeaways that merely move the number — the wrong target. Presence of any of
// these fails the "not a number prescription" check.
const NUMBER_PRESCRIPTION_PATTERNS: RegExp[] = [
  /\b(lower|lowering|reduce|reducing|drop|dropping|dial back|dial down|bring down|pull down)\b[^.!?]{0,40}\b(confidence|number|numbers|percentage|percentages|estimate|estimates)\b/i,
  /\b(raise|raising|increase|increasing|boost|boosting|bump up)\b[^.!?]{0,40}\b(confidence|number|numbers|percentage|percentages|estimate|estimates)\b/i,
  /\b(shift|adjust|move|change|nudge)\b[^.!?]{0,40}\b(confidence|number|numbers|percentage|percentages)\b[^.!?]{0,20}\b(down|up|lower|higher)\b/i,
  /\bbe\s+(more|less)\s+confident\b/i,
  /\b(high[-\s]confidence)\s+(calls|predictions|bets|forecasts)\s+down\b/i,
];

// A bias-point figure in the prose ("+17 points", "17 points overconfident") —
// exactly the numeric density we're dropping.
const BIAS_POINTS_PATTERN = /\b\d+\s+points\b/i;

// Chart shape/trend words that coarse decile buckets can NEVER support — always
// unverifiable, so their presence fails the chart guardrail.
const FORBIDDEN_CHART_SHAPE: RegExp[] = [
  /\bsteep/i,
  /\bdip\b/i,
  /\bspike/i,
  /\bs-?curve\b/i,
  /\bpeak\b/i,
  /\bvalley\b/i,
  /\bplateau/i,
  /\bcliff\b/i,
  /\bjagged/i,
];
const BELOW_LINE_CLAIM = /below the (line|diagonal)/i;
const ABOVE_LINE_CLAIM = /above the (line|diagonal)/i;
const IMPROVING_CLAIM =
  /(coming down|trending down|trending better|improving|getting better|line is coming down|better than (your |the )?lifetime|below (your |the )?lifetime)/i;
const WORSENING_CLAIM =
  /(trending up|trending worse|getting worse|worse than (your |the )?lifetime|above (your |the )?lifetime)/i;

/**
 * Chart commentary is grounded only when every claim it makes is derivable from
 * the supplied chart numbers. Unverifiable shape words fail outright; a
 * below/above-line or improving/worsening claim must match what the buckets and
 * the recent-vs-lifetime Brier actually show. No chart claim at all ⇒ supported
 * (omitting is the correct fallback).
 */
function chartClaimsSupported(text: string, chart: InsightRubricInput["chart"]): boolean {
  if (FORBIDDEN_CHART_SHAPE.some((re) => re.test(text))) return false;
  if (BELOW_LINE_CLAIM.test(text) && !chart.curveBelowLine) return false;
  if (ABOVE_LINE_CLAIM.test(text) && !chart.curveAboveLine) return false;
  if (IMPROVING_CLAIM.test(text) && chart.progressImproving !== true) return false;
  if (WORSENING_CLAIM.test(text) && chart.progressImproving !== false) return false;
  return true;
}

/** Salient words from a prediction text — long-enough alphabetic tokens, for the "cites a real prediction" check. */
function salientWords(texts: string[]): string[] {
  const words = new Set<string>();
  for (const t of texts) {
    for (const raw of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length >= 5) words.add(raw);
    }
  }
  return [...words];
}

/**
 * Score an insight against the rubric. Every check is a substring/regex test on
 * the text, using the deterministic figures/predictions the model was actually
 * given — so "cites their own data" means their data specifically, not any
 * number-shaped token.
 */
export function evaluateInsight(text: string, input: InsightRubricInput): InsightRubricResult {
  const lower = text.toLowerCase();

  const typeLabels = input.reasoningTypeKeys.map((k) => k.replace(/_/g, " ").toLowerCase());
  const namesReasoningPattern =
    typeLabels.some((label) => lower.includes(label)) ||
    REASONING_LENS_WORDS.some((w) => lower.includes(w));

  const figureHit = input.figures.some((f) => f.length > 0 && text.includes(f));
  const predictionHit = salientWords(input.predictionTexts).some((w) => lower.includes(w));
  const citesOwnData = figureHit || predictionHit;
  const citesConcretePrediction = predictionHit;

  const citesSampleSize = SAMPLE_SIZE_PATTERNS.some((re) => re.test(text));

  const noReasoningTypeLabel = !REASONING_TYPE_LABELS.some((label) => lower.includes(label));

  const noBiasPoints = !BIAS_POINTS_PATTERN.test(text);

  const chartOk = chartClaimsSupported(text, input.chart);

  const prescribesBehavior = BEHAVIOR_CUES.some((cue) => lower.includes(cue));

  const notNumberPrescription = !NUMBER_PRESCRIPTION_PATTERNS.some((re) => re.test(text));

  const failures: string[] = [];
  if (!namesReasoningPattern) failures.push("namesReasoningPattern");
  if (!citesOwnData) failures.push("citesOwnData");
  if (!citesConcretePrediction) failures.push("citesConcretePrediction");
  if (!citesSampleSize) failures.push("citesSampleSize");
  if (!noReasoningTypeLabel) failures.push("noReasoningTypeLabel");
  if (!noBiasPoints) failures.push("noBiasPoints");
  if (!chartOk) failures.push("chartClaimsSupported");
  if (!prescribesBehavior) failures.push("prescribesBehavior");
  if (!notNumberPrescription) failures.push("notNumberPrescription");

  return {
    namesReasoningPattern,
    citesOwnData,
    citesConcretePrediction,
    citesSampleSize,
    noReasoningTypeLabel,
    noBiasPoints,
    chartClaimsSupported: chartOk,
    prescribesBehavior,
    notNumberPrescription,
    passed: failures.length === 0,
    failures,
  };
}

/**
 * Derive the rubric's whitelist from the same deterministic stats the prompt was
 * built from — the figures the model was given and the sample predictions — so
 * the "cites their own data" check is grounded in exactly those inputs.
 */
export function rubricInputFromStats(stats: ScopeStats): InsightRubricInput {
  const figures: string[] = [];
  const reasoningTypeKeys: string[] = [];
  const predictionTexts: string[] = [];

  for (const g of stats.reasoningGroups) {
    if (g.key !== null) reasoningTypeKeys.push(g.key);
    if (g.n > 0) figures.push(`${Math.round((g.hits / g.n) * 100)}%`);
    figures.push(`n=${g.n}`);
    predictionTexts.push(...g.hitExamples, ...g.missExamples);
  }
  for (const row of stats.byCategory) {
    figures.push(`${Math.round(row.hitRate * 100)}%`);
    figures.push(`n=${row.n}`);
  }
  for (const s of stats.samples) {
    figures.push(`${s.confidencePercent}%`);
    predictionTexts.push(s.text);
  }

  // Near-diagonal noise isn't a "below/above the line" feature.
  const EPS = 0.02;
  const curveBelowLine = stats.chart.curveBuckets.some((b) => b.hitRate < b.center - EPS);
  const curveAboveLine = stats.chart.curveBuckets.some((b) => b.hitRate > b.center + EPS);
  const progressImproving = stats.chart.progress
    ? stats.chart.progress.recent < stats.chart.progress.lifetime
    : null;

  return {
    reasoningTypeKeys,
    figures,
    predictionTexts,
    chart: { curveBelowLine, curveAboveLine, progressImproving },
  };
}
