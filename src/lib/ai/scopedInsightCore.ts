// Scoped insight — pure prompt construction + DB-free run orchestration
// (docs §9.4). Like postmortemCore/enrichCore: builds the system + user prompts,
// runs the one-call-plus-one-repair, and owns the "persist only on a real
// completion, always log the spend" logic — all unit-testable with no
// DATABASE_URL and no network (the model call is injected).
//
// The discipline is the same as the post-mortem's: the model NARRATES the
// deterministic numbers and the user's own frozen text it is handed. It never
// computes, estimates, contradicts, or invents a statistic, and it never assigns
// the profile — the profile arrives pre-decided by the scoring engine.
//
// The insight's JOB is behavioral: name the pattern in the user's REASONING (via
// the reasoning_type lens and a sample of their own missed predictions), cite
// their own data, and prescribe a change in how they decide next time. A number
// prescription ("lower your confidence") is explicitly the wrong target — a user
// can type a different number without deciding any better — so the prompt forbids
// it and the eval (insightEval.ts) checks it never happens.

import type Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL, getAnthropicClient } from "@/lib/ai/anthropic";
import { enrichCategoryValues } from "@/lib/ai/enrichSchema";
import type { ModelCallResult } from "@/lib/ai/enrichCore";
import {
  scopedInsightOutputSchema,
  scopedInsightTool,
  type ScopedInsightOutput,
} from "@/lib/ai/scopedInsightSchema";
import type { GroupCalibration, Profile } from "@/lib/scoring";

/** A life-domain category (reuses the enrichment vocabulary — one source of truth). */
export type Category = (typeof enrichCategoryValues)[number];

/**
 * Which slice of history a scoped insight describes: recent form, lifetime, or a
 * single category. Category scopes carry the category in the key (`category:work`)
 * so the DB cache row keys on it directly and staleness works per category.
 */
export type InsightScope = "recent" | "lifetime" | `category:${Category}`;

const CATEGORY_PREFIX = "category:";

/** The scope key for a single category. */
export function categoryScope(category: Category): InsightScope {
  return `${CATEGORY_PREFIX}${category}`;
}

/** The category a scope names, or null for recent/lifetime / an unknown category. */
export function scopeCategory(scope: string): Category | null {
  if (!scope.startsWith(CATEGORY_PREFIX)) return null;
  const cat = scope.slice(CATEGORY_PREFIX.length);
  return (enrichCategoryValues as readonly string[]).includes(cat) ? (cat as Category) : null;
}

/** True for any scope string the app knows how to build — the server-side gate on the action. */
export function isValidScope(scope: string): scope is InsightScope {
  return scope === "recent" || scope === "lifetime" || scopeCategory(scope) !== null;
}

/** One of the user's own missed predictions, with the reasoning they froze beforehand. */
export interface ReasoningSample {
  text: string;
  reasoningType: string | null;
  confidencePercent: number;
  outcome: boolean;
  reasoning: string;
  outcomeNote: string | null;
}

/**
 * The user's predictions grouped by the internal reasoning_type — but presented
 * to the model as EXAMPLES, not a label. `key`/`gloss` are internal scaffolding
 * (the model must never echo them); the example prediction texts are what the
 * insight anchors to, so the pattern emerges from what they actually predicted.
 */
export interface ReasoningGroupView {
  /** Internal reasoning_type key — grouping only, never output. */
  key: string | null;
  /** Plain-language description of what the group shares — an INTERNAL hint, never to be echoed. */
  gloss: string;
  n: number;
  hits: number;
  /** Titles of predictions in this group that hit (up to a few). */
  hitExamples: string[];
  /** Titles of predictions in this group that missed (up to a few). */
  missExamples: string[];
}

/**
 * One point of the on-page calibration curve, exactly as plotted — so the insight
 * can only describe curve features these numbers actually show.
 */
export interface CurveBucketView {
  /** Confidence-decile center (e.g. 0.75 for the 70–80% band). */
  center: number;
  /** Observed hit rate in the band. Below `center` ⇒ the dot sits below the diagonal. */
  hitRate: number;
  n: number;
}

/** The deterministic chart data — the ONLY basis for any chart commentary (see the CHART rule). */
export interface ChartData {
  /** The calibration curve's plotted buckets; EMPTY when the curve is locked (not shown), so it's never referenced. */
  curveBuckets: CurveBucketView[];
  /** Recent (last-window) vs lifetime Brier for the progress chart; null when the chart is locked. */
  progress: { recent: number; lifetime: number } | null;
}

/**
 * The deterministic aggregate an insight is written from — every number here was
 * produced by the scoring engine, never the model, and every example/sample is
 * the user's own frozen text. The prompt builder turns exactly these into the
 * model's input, so "every claim traces to a supplied figure, prediction, or
 * chart number" is enforceable by construction.
 */
export interface ScopeStats {
  scope: InsightScope;
  /** Resolved, non-void count in the scope — the denominator behind every figure. */
  n: number;
  /** The code-assigned profile. The model narrates it; it never re-decides it. */
  profile: Profile;
  brier: number | null;
  bias: number | null;
  boldness: number | null;
  /** The PRIMARY lens: predictions grouped by reasoning kind, anchored to examples. */
  reasoningGroups: ReasoningGroupView[];
  byCategory: GroupCalibration[];
  /** Representative misses (their frozen reasoning) — the raw material for a behavioral fix. */
  samples: ReasoningSample[];
  /** Deterministic chart facts — the only thing chart commentary may describe. */
  chart: ChartData;
}

/**
 * Version of the system prompt / insight contract. Bump whenever
 * `SCOPED_INSIGHT_SYSTEM_PROMPT` (or the deterministic inputs it reasons over)
 * changes materially. A cached insight whose stored version is behind this is
 * treated as stale (see scopedInsightView.insightFreshness), so an improvement
 * to the AI's instructions reaches existing users without them needing to
 * resolve anything new. Code-controlled, never user-settable.
 *
 * v1: the actionable rework — reasoning-type lens, own-data citation, behavioral
 * (not number) prescription. (v0 = the pre-versioning templated/number-first
 * insights, which this marks stale so they re-roll under the new contract.)
 * v2: sample-size honesty ("4 of 13", not a bare "31%") + a kinder coach tone.
 * v3: reasoning types described in plain behavioral language, never named; a
 *     strong category signal allowed as a secondary point with its denominator.
 * v4: anchor to the user's OWN example predictions (not paraphrased categories);
 *     sparse numbers (no bias points, prefer plain comparisons); guarded chart
 *     interpretation from supplied bucket + Brier data only.
 */
export const SCOPED_INSIGHT_PROMPT_VERSION = 4;

/**
 * The coaching constraint, kept as a stable constant so it rides its own
 * prompt-cached system block (docs §9.7). Every rule is an eval rubric item
 * (insightEval.ts): reason about their reasoning, cite their own data, prescribe
 * a behavior — and never let the takeaway collapse to "adjust the number".
 *
 * NOTE: material edits here must bump SCOPED_INSIGHT_PROMPT_VERSION.
 */
export const SCOPED_INSIGHT_SYSTEM_PROMPT = `You are a knowledgeable calibration coach that turns ONE user's own forecasting record into a single, specific, behavioral insight. You are given deterministic, pre-computed statistics, the user's own predictions grouped by the kind of reasoning behind them, a few of their frozen reasoning notes, and the numbers plotted on the charts they're looking at. A separate scoring engine has ALREADY assigned their profile. Your job is to write 3-5 sentences that make them DECIDE differently next time — not to restate their score.

ANCHOR TO THEIR OWN PREDICTIONS. This is the core of the whole thing. Lead with concrete examples of what THEY predicted and let the pattern emerge from those. The predictions are grouped for you by a hidden internal tag with a plain-language hint; the hint is ONLY to help you SEE the grouping — you must NEVER repeat or paraphrase it. The user has never heard those phrases and they carry no meaning. Describe what the predictions in a group have in common in your OWN words, grounded in the example titles.
  Good: "You're good at reading other people — you called your teammate's delivery and the candidate accepting, and you were right about 4 of 6 of those. Predictions about yourself are where it slips: 'finish the course module' and 'keep a 7-day meditation streak' both missed."
  Bad (a paraphrased category, no examples): "When your reason is trust in someone else's track record, you hit 4 of 6."

Every insight MUST do all three:
1) Name the pattern by CONTRASTING groups of their actual predictions — which kind of prediction they tend to get right, and which they get wrong — using their own example titles.
2) Cite their own data: reference at least one specific prediction of theirs (its title), and where a claim needs weight, one simple count.
3) End with a PROCESS change — something they will DO differently next time. Point at the decision behavior, e.g. "before your next prediction that leans on your own follow-through, start from what usually happens when you make plans like that, not from the plan itself."

Hard rules:
- PLAIN LANGUAGE, NO LABELS: never name or paraphrase a reasoning category or coined term, never invent a label, never use internal tag-style names. Let the example predictions carry the meaning.
- SPARSE NUMBERS: read like a coach talking, not a stats readout. Use AT MOST one or two simple counts ("4 of 6", "2 of 8") where a claim genuinely needs weight. Prefer plain comparisons ("about two-thirds of the time") over percentages. NEVER state a bias-point figure ("+17 points") or a mean-confidence figure — those live in the page's stats, not your prose.
- CATEGORY IS SECONDARY: the reasoning pattern is the primary, most actionable finding. You MAY add ONE secondary aside about a life-area category (e.g. "your work predictions hit 5 of 8") when a category signal is notably strong — always with its count — but never let the category become the main point.
- CHART HELP: add ONE sentence connecting your finding to what they can SEE on the page — but ONLY describe features that are present in the supplied chart numbers (the calibration buckets and the recent-vs-lifetime Brier). You may say their dots sit BELOW the diagonal in a confidence range when the buckets show a hit rate lower than that confidence level (or ABOVE when higher); you may say the recent trend is coming down / improving when the recent Brier is lower than lifetime (or worsening when higher). NEVER use shape or trend words the numbers don't support — no "steep", "dip", "spike", "rises", "S-curve", "peak". If the supplied chart data doesn't clearly support an observation, or a chart isn't provided (it's locked), OMIT chart commentary entirely rather than invent it.
- NEVER let the takeaway reduce to "lower your confidence", "raise your confidence", "shift your numbers", "be more/less confident", or any variation of just adjusting the percentage. A user can type a different number without deciding better. The fix must change how they REASON or what evidence they gather.
- Anchor EVERY claim to a supplied prediction, figure, or chart number. Never invent predictions, statistics, causes, motives, or chart features. Never compute or contradict a number you were given.
- The profile is already decided; narrate it, never reassign it. Use it only to choose the emphasis:
  - hedger: their confidence barely separates outcomes. Point at the kind of prediction that reliably comes true for them and tell them to commit further from 50% when it looks like those — not to inflate numbers blindly.
  - miscalibrated: their confidence is running ahead of their results. Point at the kind of prediction with the most room to improve (the group they miss most) and prescribe how to reason about it differently. Do NOT tell them to lower the number.
  - calibrated_and_bold: their numbers carry real information. Point at the kind of prediction working best and tell them to lean on it and bring that same discipline to the kind with the most room to grow.

TONE: write as a knowledgeable coach, not a critic. Frame a weakness as "the kind of prediction with the most room to improve," never "your worst" or "you're bad at". Name the gap plainly — but do NOT hedge the finding, soften the counts, or add reassuring filler. The honesty is the value; only the framing should be kind.

Format: 3-5 sentences, plain and direct, second person. No headings, no bullets, no preamble, no sign-off.`;

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/**
 * Plain-language description of each internal reasoning_type — an INTERNAL hint
 * so the model can SEE the grouping; it must never be echoed to the user. The
 * taxonomy is internal (docs §6, §9.4). Exported so the view can attach the gloss
 * to each `ReasoningGroupView`. Keep in sync with enrichReasoningTypeValues.
 */
const REASONING_TYPE_GLOSS: Record<string, string> = {
  base_rate: "the reason was how often this kind of thing usually happens (a base rate)",
  specific_evidence: "the reason rested on concrete evidence about this specific case",
  trust_in_person: "the reason rested on trust in a specific person's reliability or track record",
  gut_feel: "the reason was a gut feeling or intuition",
  plan_optimism: "the reason was their own intention or plan to follow through",
};

export function reasoningGloss(key: string | null): string {
  return (key !== null ? REASONING_TYPE_GLOSS[key] : undefined) ?? "the reason didn't fit a clear pattern";
}

function quoteList(texts: string[]): string {
  return texts.length > 0 ? texts.map((t) => `"${t}"`).join(", ") : "(none in this window)";
}

/**
 * Each reasoning group as EXAMPLES, not a label — the actual predictions that hit
 * vs missed, with the internal gloss kept behind an explicit do-not-echo warning.
 * This is what makes the insight anchor to what the user really predicted.
 */
function reasoningGroupLines(groups: ReasoningGroupView[]): string[] {
  if (groups.length === 0) return ["(not enough data to group)"];
  return groups.flatMap((g) => [
    `- ${g.hits} of ${g.n} hit. Hits: ${quoteList(g.hitExamples)}. Missed: ${quoteList(g.missExamples)}.`,
    `    (internal grouping hint — do NOT repeat or paraphrase: these are cases where ${g.gloss}.)`,
  ]);
}

function categoryLines(rows: GroupCalibration[]): string[] {
  if (rows.length === 0) return ["(not enough data to break down)"];
  return rows.map((r) => `- ${r.key}: ${r.hits} of ${r.n} hit`);
}

/**
 * The chart facts, verbatim from the deterministic inputs — the ONLY basis for a
 * chart comment. A locked chart is stated as absent so the model omits it rather
 * than inventing one.
 */
function chartLines(chart: ChartData): string[] {
  const lines: string[] = [];
  if (chart.curveBuckets.length > 0) {
    lines.push(
      "Calibration curve on the page (each dot: confidence level → how often those actually came true):",
    );
    for (const b of chart.curveBuckets) {
      lines.push(
        `- around ${pct(b.center)} confidence: actually came true ${pct(b.hitRate)} of the time (n=${b.n})`,
      );
    }
  } else {
    lines.push("Calibration curve: not shown yet (locked) — do NOT reference it.");
  }
  if (chart.progress) {
    lines.push(
      `Progress chart: recent Brier ${chart.progress.recent.toFixed(2)} vs lifetime ${chart.progress.lifetime.toFixed(
        2,
      )} (lower is better; recent lower ⇒ improving).`,
    );
  } else {
    lines.push("Progress chart: not shown yet (locked) — do NOT reference it.");
  }
  return lines;
}

function scopeDescription(scope: InsightScope): string {
  const cat = scopeCategory(scope);
  if (cat) return `the user's predictions in the ${cat} category`;
  return scope === "recent"
    ? "the user's most recent resolutions (recent)"
    : "the user's entire resolved record (lifetime)";
}

/**
 * The user-turn prompt, built purely from the deterministic `ScopeStats`. Leads
 * with the user's OWN predictions grouped as examples (the primary lens), then
 * the secondary category counts, the chart facts (the only basis for chart
 * comments), and a few detailed misses for the fix. Every prediction, count, and
 * chart number the model may cite is present, so the insight can be fully
 * anchored — and never generic, never a paraphrased category, never an invented
 * chart feature.
 */
export function buildScopedInsightPrompt(stats: ScopeStats): string {
  const lines = [
    `Scope: ${scopeDescription(stats.scope)}.`,
    `Resolved predictions in scope: ${stats.n}.`,
    `Assigned profile (already decided — narrate, do not change): ${stats.profile}.`,
    "",
    "THEIR OWN PREDICTIONS, grouped by the kind of reasoning behind them — YOUR PRIMARY LENS. Contrast the groups they get right vs wrong, using these example titles. Describe the shared trait in your OWN plain words; never the internal hint:",
    ...reasoningGroupLines(stats.reasoningGroups),
    "",
    "By life-area category — SECONDARY (you may name a category, but only with its count):",
    ...categoryLines(stats.byCategory),
    "",
    "CHART DATA — the ONLY basis for any chart comment. Describe only what these numbers show; if they don't clearly support an observation, say nothing about the charts:",
    ...chartLines(stats.chart),
    "",
    "A few of their own missed predictions with the reasoning they wrote beforehand (use for the concrete fix):",
    ...sampleLines(stats.samples),
    "",
    "Write the insight now (3-5 sentences): contrast groups of their REAL predictions in plain words (no labels, no paraphrased categories), keep numbers sparse (a count or two, no bias points), add ONE chart sentence only if the chart data supports it, and end with a concrete change in HOW THEY REASON next time.",
  ];
  return lines.join("\n");
}

function sampleLines(samples: ReasoningSample[]): string[] {
  if (samples.length === 0) {
    return ["(No missed predictions with written reasoning in this scope — lean on the groups above.)"];
  }
  return samples.flatMap((s, i) => {
    const lines = [
      `${i + 1}. "${s.text}" — you were ${s.confidencePercent}% confident; actual outcome: ${
        s.outcome ? "YES" : "NO"
      } (a miss).`,
      `   Your reasoning: "${s.reasoning}"`,
    ];
    if (s.outcomeNote) lines.push(`   Your note on what happened: "${s.outcomeNote}"`);
    return lines;
  });
}

/**
 * The deterministic snapshot persisted alongside the body — pure audit. It
 * deliberately EXCLUDES the users' own text (example titles, reasoning samples):
 * that content already lives on the prediction rows, so there's no reason to
 * duplicate it into a second table. Keeps only the numbers and counts.
 */
export function scopeStatsJson(stats: ScopeStats): Record<string, unknown> {
  return {
    scope: stats.scope,
    n: stats.n,
    profile: stats.profile,
    brier: stats.brier,
    bias: stats.bias,
    boldness: stats.boldness,
    reasoningGroups: stats.reasoningGroups.map((g) => ({ key: g.key, n: g.n, hits: g.hits })),
    byCategory: stats.byCategory,
    chart: stats.chart,
    nSamples: stats.samples.length,
  };
}

// --- model call + repair ---------------------------------------------------

/** The real Anthropic call — forced tool-use, one tool, structured output, cached system block. */
export async function defaultInsightCallModel(prompt: string): Promise<ModelCallResult> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 500,
    system: [
      { type: "text", text: SCOPED_INSIGHT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    tools: [scopedInsightTool],
    tool_choice: { type: "tool", name: scopedInsightTool.name },
    messages: [{ role: "user", content: prompt }],
  });
  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  return {
    toolInput: toolUseBlock?.input ?? null,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

export interface InsightWithRepairResult {
  output: ScopedInsightOutput | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  attempts: number;
}

/**
 * One call + one repair retry (same shape as `runEnrichWithRepair`). `callModel`
 * is injected so tests never hit the network; the default is the real call.
 * Token counts accumulate across both attempts so the spend is logged honestly
 * even when the first attempt was malformed.
 */
export async function runInsightWithRepair(
  prompt: string,
  callModel: (prompt: string) => Promise<ModelCallResult> = defaultInsightCallModel,
): Promise<InsightWithRepairResult> {
  const first = await callModel(prompt);
  const firstParsed = scopedInsightOutputSchema.safeParse(first.toolInput);
  if (firstParsed.success) {
    return {
      output: firstParsed.data,
      totalInputTokens: first.inputTokens,
      totalOutputTokens: first.outputTokens,
      attempts: 1,
    };
  }

  const repairPrompt = [
    prompt,
    `Your previous tool call was invalid: ${firstParsed.error.message}`,
    "Call the write_insight tool again with a single non-empty `insight` string and nothing else.",
  ].join("\n");
  const second = await callModel(repairPrompt);
  const secondParsed = scopedInsightOutputSchema.safeParse(second.toolInput);
  return {
    output: secondParsed.success ? secondParsed.data : null,
    totalInputTokens: first.inputTokens + second.inputTokens,
    totalOutputTokens: first.outputTokens + second.outputTokens,
    attempts: 2,
  };
}

// --- run + persist orchestration (DB-free, deps injected) ------------------

export interface ScopedInsightDeps {
  /** The insight call (one shot + one repair). Real default: runInsightWithRepair. */
  runInsight: (prompt: string) => Promise<InsightWithRepairResult>;
  /**
   * Upsert the cached insight row. `n` is the deterministic scope count and
   * `promptVersion` the contract the body was written under — both come from
   * here (code), never from the model's reply.
   */
  persist: (
    bodyText: string,
    nResolvedAtGeneration: number,
    promptVersion: number,
    statsJson: Record<string, unknown>,
  ) => Promise<void>;
  /** Log the spend to ai_calls (0/0 tokens on a thrown call). Always called. */
  logCall: (usage: { inputTokens: number; outputTokens: number; latencyMs: number }) => Promise<void>;
  /** Injectable clock for deterministic latency in tests. */
  now?: () => number;
}

export interface ScopedInsightRunResult {
  ok: boolean;
  /** The generated body on success; null on any failure (caller shows the templated fallback). */
  bodyText: string | null;
}

/**
 * Generate one scoped insight, persist it only on a real completion, and always
 * log the spend. Graceful degradation matches the post-mortem's: a thrown call
 * or a repair that still fails validation persists NOTHING (so the page keeps
 * showing the deterministic templated fallback) but is still logged, so the cap
 * count reflects the attempt. The persisted `n` and stats come from `stats`, the
 * deterministic input — never parsed back out of the model's reply. Resolves,
 * never rejects.
 */
export async function runScopedInsight(
  stats: ScopeStats,
  deps: ScopedInsightDeps,
): Promise<ScopedInsightRunResult> {
  const now = deps.now ?? Date.now;
  const start = now();
  const prompt = buildScopedInsightPrompt(stats);

  let result: InsightWithRepairResult | null = null;
  try {
    result = await deps.runInsight(prompt);
  } catch {
    await deps.logCall({ inputTokens: 0, outputTokens: 0, latencyMs: now() - start });
    return { ok: false, bodyText: null };
  }

  await deps.logCall({
    inputTokens: result.totalInputTokens,
    outputTokens: result.totalOutputTokens,
    latencyMs: now() - start,
  });

  if (result.output === null) {
    return { ok: false, bodyText: null };
  }

  await deps.persist(
    result.output.insight,
    stats.n,
    SCOPED_INSIGHT_PROMPT_VERSION,
    scopeStatsJson(stats),
  );
  return { ok: true, bodyText: result.output.insight };
}
