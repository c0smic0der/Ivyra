// Scoped insight — pure view assembly (docs §9.4). No DB, no network, no AI:
// given a user's full resolved/void history plus whatever insight is cached for
// a scope, this decides the scope's deterministic stats, the code-assigned
// profile, the representative-miss samples, and every piece of the card the page
// renders (which text to show, out-of-date state, whether Generate/Regenerate is
// offered, and — for a category scope — whether it has enough data to be worth
// offering at all). Unit-testable with zero DATABASE_URL, like insightsCore.ts.
//
// The scope stats built here are the ONLY inputs the AI insight is written from;
// the model never computes them and this file never reads a number back out of
// the model's reply.

import { isUnderDailyCap } from "@/lib/ai/enrichCore";
import { enrichCategoryValues } from "@/lib/ai/enrichSchema";
import {
  categoryScope,
  reasoningGloss,
  scopeCategory,
  SCOPED_INSIGHT_PROMPT_VERSION,
  type Category,
  type ChartData,
  type InsightScope,
  type ReasoningGroupView,
  type ReasoningSample,
  type ScopeStats,
} from "@/lib/ai/scopedInsightCore";
import { isMiss } from "@/lib/ai/postmortemCore";
import {
  biasScore,
  biasSentence,
  brierSentence,
  calibrationBuckets,
  calibrationByGroup,
  classifyProfile,
  CURVE_UNLOCK_N,
  decompose,
  PROFILE_UNLOCK_N,
  PROGRESS_UNLOCK_N,
  resolvedNonVoid,
  rollingBrier,
  ROLLING_WINDOW,
  runningBrier,
  type Decomposition,
  type Scorable,
} from "@/lib/scoring";

/**
 * The row shape the page maps DB predictions into. Carries the frozen text the
 * insight's behavioral half needs — the user's own reasoning and outcome note —
 * on top of the numbers the stats are computed from.
 */
export interface InsightPrediction extends Scorable {
  category: string | null;
  reasoningType: string | null;
  text: string;
  reasoning: string | null;
  outcomeNote: string | null;
}

/** Resolved predictions in a category needed before a category insight is offered (noise floor). */
export const CATEGORY_UNLOCK_N = 10;

/** Up to this many of the user's own missed predictions are fed to the model as raw material. */
export const MAX_REASONING_SAMPLES = 4;

/** Up to this many example prediction titles per reasoning group (hits and misses each). */
export const MAX_GROUP_EXAMPLES = 2;

/**
 * The scope's predictions. Lifetime is the whole history; Recent is the SAME
 * trailing `ROLLING_WINDOW` slice the rolling-Brier progress chart uses (sliced
 * off `resolvedNonVoid`, so "the last 20 resolutions" means resolutions, not raw
 * rows); a category scope is every prediction in that category. Sharing
 * `ROLLING_WINDOW` is what guarantees the progress chart and the Recent insight
 * describe one slice.
 */
export function selectScope<T extends Scorable & { category?: string | null }>(
  preds: T[],
  scope: InsightScope,
): T[] {
  if (scope === "lifetime") return preds;
  if (scope === "recent") return resolvedNonVoid(preds).slice(-ROLLING_WINDOW);
  const cat = scopeCategory(scope);
  return cat === null ? [] : preds.filter((p) => p.category === cat);
}

/**
 * Boldness (resolution ÷ uncertainty, clamped to [0, 1]) WITHOUT the curve's
 * sample gate — the profile is assignable over the Recent scope's ~20 rows,
 * below `CURVE_UNLOCK_N`, so it can't route through the gated `boldness()`. The
 * division is guarded when `uncertainty === 0` (all-YES / all-NO): null, so the
 * profile degrades to insufficient_data rather than dividing by zero.
 */
function profileBoldness(d: Decomposition | null): number | null {
  if (d === null || d.uncertainty === 0) return null;
  return Math.min(1, Math.max(0, d.resolution / d.uncertainty));
}

/**
 * A small, representative set of the user's own MISSED predictions (confidence on
 * the wrong side, per `isMiss`) that carry written reasoning — the raw material
 * for a behavioral fix. Deterministic: misses are ranked by confidence (a 90%
 * miss teaches more than a 55% one), then a first pass takes one per distinct
 * reasoning type so the sample spans their justification styles, and a second
 * pass fills the remaining slots by confidence. Misses without reasoning are
 * skipped — there is nothing to name.
 */
function selectReasoningSamples(
  resolved: Array<InsightPrediction & { outcome: boolean }>,
): ReasoningSample[] {
  const misses = resolved
    .filter((p) => (p.reasoning?.trim().length ?? 0) > 0 && isMiss(p.confidence, p.outcome))
    .sort((a, b) => b.confidence - a.confidence);

  const picked: Array<InsightPrediction & { outcome: boolean }> = [];
  const seenTypes = new Set<string>();
  for (const m of misses) {
    if (picked.length >= MAX_REASONING_SAMPLES) break;
    const t = m.reasoningType ?? "__null";
    if (!seenTypes.has(t)) {
      seenTypes.add(t);
      picked.push(m);
    }
  }
  for (const m of misses) {
    if (picked.length >= MAX_REASONING_SAMPLES) break;
    if (!picked.includes(m)) picked.push(m);
  }

  return picked.map((p) => ({
    text: p.text,
    reasoningType: p.reasoningType,
    confidencePercent: Math.round(p.confidence * 100),
    outcome: p.outcome,
    reasoning: p.reasoning!.trim(),
    outcomeNote: p.outcomeNote,
  }));
}

/**
 * The user's predictions grouped by reasoning kind, each carrying example titles
 * (hits and misses) so the insight can anchor to what they actually predicted
 * rather than to a paraphrased category. Deterministic: examples are the
 * highest-confidence within each side, groups sorted by size.
 */
function buildReasoningGroups(
  resolved: Array<InsightPrediction & { outcome: boolean }>,
): ReasoningGroupView[] {
  const groups = new Map<string, Array<InsightPrediction & { outcome: boolean }>>();
  for (const p of resolved) {
    const key = p.reasoningType ?? "__null";
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }

  const byConfidenceDesc = (
    a: InsightPrediction & { outcome: boolean },
    b: InsightPrediction & { outcome: boolean },
  ) => b.confidence - a.confidence;

  const rows: ReasoningGroupView[] = [];
  for (const [key, members] of groups) {
    const reasoningType = key === "__null" ? null : key;
    const hits = members.filter((m) => m.outcome).sort(byConfidenceDesc);
    const misses = members.filter((m) => !m.outcome).sort(byConfidenceDesc);
    rows.push({
      key: reasoningType,
      gloss: reasoningGloss(reasoningType),
      n: members.length,
      hits: hits.length,
      hitExamples: hits.slice(0, MAX_GROUP_EXAMPLES).map((m) => m.text),
      missExamples: misses.slice(0, MAX_GROUP_EXAMPLES).map((m) => m.text),
    });
  }
  return rows.sort((a, b) => b.n - a.n);
}

/**
 * The chart facts the insight may cite — computed over the FULL resolved record
 * (the on-page charts are lifetime) and GATED by the same unlock thresholds the
 * page uses, so a chart that isn't rendered is passed as absent and the insight
 * won't reference it. Curve `center` is the plotted mean confidence, so
 * `hitRate < center` means exactly "the dot sits below the diagonal".
 */
function buildChartData(preds: InsightPrediction[]): ChartData {
  const lifetime = resolvedNonVoid(preds);
  const nLifetime = lifetime.length;

  const curveBuckets =
    nLifetime >= CURVE_UNLOCK_N
      ? calibrationBuckets(lifetime).map((b) => ({
          center: b.meanConfidence,
          hitRate: b.actualFrequency,
          n: b.n,
        }))
      : [];

  const recent = rollingBrier(lifetime, ROLLING_WINDOW);
  const lifetimeBrier = runningBrier(lifetime);
  const progress =
    nLifetime >= PROGRESS_UNLOCK_N && recent !== null && lifetimeBrier !== null
      ? { recent, lifetime: lifetimeBrier }
      : null;

  return { curveBuckets, progress };
}

/**
 * The deterministic aggregate an insight is written from. The profile is
 * classified HERE, in code, from this scope's reliability and boldness — never
 * by the model. `reasoningGroups` (example-anchored) are the primary lens;
 * `samples` are detailed misses for the fix; `chart` is the only basis for chart
 * commentary. Every figure comes straight from the scoring engine.
 */
export function buildScopeStats(preds: InsightPrediction[], scope: InsightScope): ScopeStats {
  const resolved = resolvedNonVoid(selectScope(preds, scope));
  const n = resolved.length;
  const d = decompose(resolved);
  const boldness = profileBoldness(d);
  const profile = classifyProfile({ n, reliability: d?.reliability ?? null, boldness });

  return {
    scope,
    n,
    profile,
    brier: runningBrier(resolved),
    bias: biasScore(resolved),
    boldness,
    reasoningGroups: buildReasoningGroups(resolved),
    byCategory: calibrationByGroup(resolved, (p) => p.category),
    samples: selectReasoningSamples(resolved),
    // Chart facts are lifetime + unlock-gated, so they match the on-page charts
    // regardless of the insight's scope.
    chart: buildChartData(preds),
  };
}

/** recent | lifetime | category — the toggle groups on this. */
export function scopeKind(scope: InsightScope): "recent" | "lifetime" | "category" {
  return scopeCategory(scope) !== null ? "category" : (scope as "recent" | "lifetime");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short label for the scope toggle. */
export function scopeToggleLabel(scope: InsightScope): string {
  const cat = scopeCategory(scope);
  if (cat) return capitalize(cat);
  return scope === "recent" ? "Recent" : "Lifetime";
}

/** Full scope label shown on the card — always stated so the user knows which slice they read. */
export function scopeLabel(stats: ScopeStats): string {
  const plural = stats.n === 1 ? "" : "s";
  const cat = scopeCategory(stats.scope);
  if (cat) return `${capitalize(cat)} — ${stats.n} resolution${plural}`;
  return stats.scope === "lifetime"
    ? `Lifetime — all ${stats.n} resolution${plural}`
    : `Recent — last ${stats.n} resolution${plural}`;
}

/** The templated stats summary — the deterministic fallback shown when there is no usable AI text. */
export function buildScopeFallback(stats: ScopeStats): string {
  if (stats.brier === null || stats.bias === null) {
    return "No resolutions in this scope yet.";
  }
  return `${brierSentence(stats.brier)} ${biasSentence(stats.bias)}`;
}

/** One entry in the category dropdown: a category scope with its progress and selectability. */
export interface CategoryMenuItem {
  category: Category;
  scope: InsightScope;
  /** Resolved count in the category. */
  n: number;
  /** Selectable once `n >= CATEGORY_UNLOCK_N`; otherwise shown disabled with its progress. */
  unlocked: boolean;
  /** Dropdown label — "Work (12)" when unlocked, "Work (8 of 10)" while locked. */
  label: string;
}

/**
 * The full category dropdown model: EVERY life-domain category (count 0 when the
 * user has none yet), each flagged `unlocked` once it clears `CATEGORY_UNLOCK_N`,
 * carrying a progress label. Listing every category — not just the ones with data
 * — makes the feature discoverable and shows the user how close each is, rather
 * than hiding the gate behind a sentence. Sorted by count so the closest lead.
 */
export function categoryMenu(preds: InsightPrediction[]): CategoryMenuItem[] {
  const counts = new Map<string, number>();
  for (const row of calibrationByGroup(preds, (p) => p.category)) counts.set(row.key, row.n);

  return enrichCategoryValues
    .map((category): CategoryMenuItem => {
      const n = counts.get(category) ?? 0;
      const unlocked = n >= CATEGORY_UNLOCK_N;
      return {
        category,
        scope: categoryScope(category),
        n,
        unlocked,
        label: unlocked
          ? `${capitalize(category)} (${n})`
          : `${capitalize(category)} (${n} of ${CATEGORY_UNLOCK_N})`,
      };
    })
    .sort((a, b) => b.n - a.n);
}

/** The tooltip explaining the category gate — shared by the control and its tests. */
export const CATEGORY_GATE_TOOLTIP = `Category insights need ${CATEGORY_UNLOCK_N} resolved predictions in a single category.`;

/** A cached insight row for one scope (the fields the freshness check needs). */
export interface CachedInsight {
  scope: InsightScope;
  bodyText: string;
  nResolvedAtGeneration: number;
  /** The SCOPED_INSIGHT_PROMPT_VERSION the body was written under. */
  promptVersion: number;
}

export type InsightFreshness = "fresh" | "stale" | "absent";

/** Why a cached insight is stale — drives the message and whether a count is shown. */
export type StaleReason = "resolutions" | "prompt";

/**
 * Whether a cached insight still describes the current record under the current
 * contract. "fresh" only when BOTH the resolved count it was written against
 * still matches AND its prompt version equals the code's current one; "stale" if
 * new resolutions have landed OR the prompt/contract has since improved;
 * "absent" when nothing is cached. Fresh insights are never regenerated (the
 * same data yields the same analysis, so a reroll just burns the cap); a stale
 * insight is shown as-is and offers regeneration — but only on an explicit
 * click, never automatically on load.
 */
export function insightFreshness(
  cached: CachedInsight | null,
  currentN: number,
  currentPromptVersion: number = SCOPED_INSIGHT_PROMPT_VERSION,
): InsightFreshness {
  if (cached === null) return "absent";
  if (cached.nResolvedAtGeneration !== currentN) return "stale";
  if (cached.promptVersion !== currentPromptVersion) return "stale";
  return "fresh";
}

export interface InsightCardModel {
  scope: InsightScope;
  kind: "recent" | "lifetime" | "category";
  /** Short label for the scope toggle. */
  toggleLabel: string;
  /** Full scope label shown on the card. */
  label: string;
  freshness: InsightFreshness;
  /** Cached AI text — shown even when stale; null when absent. */
  cachedText: string | null;
  /** Deterministic fallback, shown when there's no cached text (or the AI is down). */
  fallbackText: string;
  /** New resolutions since the cached insight was written (>0 only when stale by new data). */
  newSinceCached: number;
  /**
   * Why a fresh insight can't be regenerated, framed as a data limitation, not a
   * broken button (fresh only; null otherwise).
   */
  currentStatusLine: string | null;
  /** The out-of-date message: new-resolution count, or "improved insight" (stale only; null otherwise). */
  staleMessage: string | null;
  /** Too little data in scope to assign a profile — no generation offered. */
  insufficientData: boolean;
  /** Honest, scope-specific reason generation isn't offered (null unless insufficientData). */
  insufficientReason: string | null;
  /** Whether the Generate/Regenerate action should be enabled (absent/stale, under cap, enough data). */
  canGenerate: boolean;
  /** Over the daily cap — the action is disabled with an honest message. */
  overCap: boolean;
  /** The count a fresh generation would stamp (the current scope n). */
  currentN: number;
}

function insufficientReason(scope: InsightScope, n: number): string {
  const cat = scopeCategory(scope);
  if (cat) {
    return `A ${cat} insight needs ${CATEGORY_UNLOCK_N} resolved predictions to avoid noise — you have ${n}.`;
  }
  return `An insight needs ${PROFILE_UNLOCK_N} resolved predictions to read your reasoning pattern — you have ${n}.`;
}

/** The fresh-state line: explains there's nothing to regenerate as a data limit, per scope. */
function currentStatusLine(stats: ScopeStats): string {
  const plural = stats.n === 1 ? "" : "s";
  const cat = scopeCategory(stats.scope);
  if (cat) {
    return `Based on your ${stats.n} resolved ${cat} prediction${plural}. A new analysis becomes available once you resolve more in ${cat}.`;
  }
  if (stats.scope === "recent") {
    return `Based on your last ${stats.n} resolved prediction${plural}. A new analysis becomes available once you resolve more.`;
  }
  return `Based on all ${stats.n} of your resolved prediction${plural}. A new analysis becomes available once you resolve more.`;
}

/** The stale-state message: names WHY it's out of date so the enabled Regenerate reads honestly. */
function staleMessage(reason: StaleReason, newSinceCached: number): string {
  if (reason === "resolutions") {
    return `${newSinceCached} new resolution${newSinceCached === 1 ? "" : "s"} since this was written. Regenerate for the latest.`;
  }
  return "An improved insight is available. Regenerate to update.";
}

/**
 * Everything the card needs, decided deterministically. Regeneration is offered
 * ONLY when there's a reason to spend a call: absent → Generate, stale →
 * Regenerate (stale = new resolutions since, or an improved prompt version). A
 * fresh insight offers no action — the same data yields the same analysis, so a
 * reroll would just burn the daily cap — and instead shows a status line framing
 * that as a data limitation. Blocked when the scope is too thin to profile
 * (honest reason) or the daily cap is spent (button disabled with an honest
 * message; cached text still shows). `currentPromptVersion` is code-controlled;
 * a cached body written under an older version reads as stale.
 */
export function buildScopedInsightCard(
  stats: ScopeStats,
  cached: CachedInsight | null,
  callsToday: number,
  cap?: number,
  currentPromptVersion: number = SCOPED_INSIGHT_PROMPT_VERSION,
): InsightCardModel {
  const freshness = insightFreshness(cached, stats.n, currentPromptVersion);
  const insufficientData = stats.profile === "insufficient_data";
  const overCap = !isUnderDailyCap(callsToday, cap);

  let newSinceCached = 0;
  let staleMsg: string | null = null;
  let currentLine: string | null = null;
  if (freshness === "stale" && cached !== null) {
    const reason: StaleReason =
      cached.nResolvedAtGeneration !== stats.n ? "resolutions" : "prompt";
    newSinceCached =
      reason === "resolutions" ? Math.abs(stats.n - cached.nResolvedAtGeneration) : 0;
    staleMsg = staleMessage(reason, newSinceCached);
  } else if (freshness === "fresh") {
    currentLine = currentStatusLine(stats);
  }

  return {
    scope: stats.scope,
    kind: scopeKind(stats.scope),
    toggleLabel: scopeToggleLabel(stats.scope),
    label: scopeLabel(stats),
    freshness,
    cachedText: cached?.bodyText ?? null,
    fallbackText: buildScopeFallback(stats),
    newSinceCached,
    currentStatusLine: currentLine,
    staleMessage: staleMsg,
    insufficientData,
    insufficientReason: insufficientData ? insufficientReason(stats.scope, stats.n) : null,
    // Only absent/stale can generate; fresh never (would reroll identical data).
    canGenerate: !insufficientData && !overCap && freshness !== "fresh",
    overCap,
    currentN: stats.n,
  };
}
