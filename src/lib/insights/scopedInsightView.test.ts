import { describe, expect, it } from "vitest";
import { DAILY_AI_CALL_CAP } from "@/lib/ai/enrichCore";
import {
  buildScopedInsightCard,
  buildScopeFallback,
  buildScopeStats,
  categoryMenu,
  CATEGORY_GATE_TOOLTIP,
  CATEGORY_UNLOCK_N,
  insightFreshness,
  MAX_GROUP_EXAMPLES,
  MAX_REASONING_SAMPLES,
  scopeLabel,
  selectScope,
  type CachedInsight,
  type InsightPrediction,
} from "@/lib/insights/scopedInsightView";
import { SCOPED_INSIGHT_PROMPT_VERSION } from "@/lib/ai/scopedInsightCore";
import { enrichReasoningTypeValues } from "@/lib/ai/enrichSchema";
import { resolvedNonVoid, rollingBrier, ROLLING_WINDOW, type Scorable } from "@/lib/scoring";

function pred(
  confidence: number,
  outcome: boolean | null,
  extra: Partial<InsightPrediction> = {},
): InsightPrediction {
  return {
    confidence,
    outcome,
    status: outcome === null ? "void" : "resolved",
    category: null,
    reasoningType: null,
    text: "a prediction",
    reasoning: null,
    outcomeNote: null,
    ...extra,
  };
}

/** n resolved predictions at a fixed confidence, half YES / half NO by index. */
function series(n: number, confidence: number, hit: (i: number) => boolean): InsightPrediction[] {
  return Array.from({ length: n }, (_, i) => pred(confidence, hit(i)));
}

describe("selectScope", () => {
  it("Recent reuses the exact trailing window rollingBrier uses", () => {
    const preds: Scorable[] = [];
    for (let i = 0; i < 25; i++) {
      preds.push({ confidence: 0.5 + (i % 5) * 0.05, outcome: i % 2 === 0, status: "resolved" });
      if (i === 3) preds.push({ confidence: 0.5, outcome: null, status: "void" });
      if (i === 7) preds.push({ confidence: 0.5, outcome: null, status: "open" });
    }
    const recent = selectScope(preds, "recent");
    expect(recent).toEqual(resolvedNonVoid(preds).slice(-ROLLING_WINDOW));
    expect(recent).toHaveLength(ROLLING_WINDOW);
    expect(rollingBrier(recent)).toBe(rollingBrier(preds));
  });

  it("Lifetime returns the whole history untouched", () => {
    const preds = series(5, 0.7, (i) => i % 2 === 0);
    expect(selectScope(preds, "lifetime")).toBe(preds);
  });

  it("Category filters to just that category's predictions", () => {
    const preds = [
      ...series(3, 0.7, () => true).map((p) => ({ ...p, category: "work" })),
      ...series(2, 0.7, () => true).map((p) => ({ ...p, category: "health" })),
    ];
    const work = selectScope(preds, "category:work");
    expect(work).toHaveLength(3);
    expect(work.every((p) => p.category === "work")).toBe(true);
  });

  it("an unknown category scope selects nothing", () => {
    const preds = series(3, 0.7, () => true).map((p) => ({ ...p, category: "work" }));
    // @ts-expect-error — exercising a malformed scope defensively
    expect(selectScope(preds, "category:bogus")).toEqual([]);
  });
});

describe("buildScopeStats — scope & profile", () => {
  it("counts only the recent window for the Recent scope", () => {
    const preds = [
      ...series(15, 0.9, () => false).map((p) => ({ ...p, category: "work" })),
      ...series(20, 0.8, (i) => i % 2 === 0).map((p) => ({ ...p, category: "health" })),
    ];
    const recent = buildScopeStats(preds, "recent");
    expect(recent.n).toBe(ROLLING_WINDOW);
    expect(recent.byCategory.map((r) => r.key)).toEqual(["health"]);

    const lifetime = buildScopeStats(preds, "lifetime");
    expect(lifetime.n).toBe(35);
  });

  it("scopes to a single category", () => {
    const preds = [
      ...series(12, 0.7, (i) => i % 2 === 0).map((p) => ({ ...p, category: "work" })),
      ...series(5, 0.7, (i) => i % 2 === 0).map((p) => ({ ...p, category: "money" })),
    ];
    const work = buildScopeStats(preds, "category:work");
    expect(work.n).toBe(12);
    expect(work.byCategory.map((r) => r.key)).toEqual(["work"]);
  });

  it("classifies the profile over the scope", () => {
    // 0.9→YES and 0.1→NO: perfectly calibrated, confidence sorts outcomes hard.
    const bold = [...series(15, 0.9, () => true), ...series(15, 0.1, () => false)];
    expect(buildScopeStats(bold, "lifetime").profile).toBe("calibrated_and_bold");
    // All 0.5, half right: calibrated but never separates outcomes.
    expect(buildScopeStats(series(20, 0.5, (i) => i % 2 === 0), "lifetime").profile).toBe("hedger");
    // All 0.9 but only 50% happen — reliability is high.
    expect(buildScopeStats(series(20, 0.9, (i) => i % 2 === 0), "lifetime").profile).toBe(
      "miscalibrated",
    );
    // Below the floor.
    expect(buildScopeStats(series(5, 0.7, () => true), "lifetime").profile).toBe("insufficient_data");
  });
});

describe("buildScopeStats — reasoning samples", () => {
  it("picks representative misses with reasoning, diversified by type and ranked by confidence", () => {
    const preds = [
      pred(0.9, false, { reasoningType: "plan_optimism", reasoning: "I'll make time", text: "finish report" }),
      pred(0.8, false, { reasoningType: "gut_feel", reasoning: "feels right", text: "they'll say yes" }),
      pred(0.7, false, { reasoningType: "plan_optimism", reasoning: "start early", text: "gym 12x" }),
      pred(0.6, true, { reasoningType: "specific_evidence", reasoning: "they confirmed", text: "deal closes" }),
      pred(0.95, false, { reasoningType: null, reasoning: "  ", text: "no-reasoning miss" }),
    ];
    const samples = buildScopeStats(preds, "lifetime").samples;

    // The 0.6 HIT (not a miss) and the blank-reasoning miss are excluded.
    const texts = samples.map((s) => s.text);
    expect(texts).not.toContain("deal closes");
    expect(texts).not.toContain("no-reasoning miss");
    // Highest-confidence miss leads; the sample spans distinct reasoning types first.
    expect(samples[0].text).toBe("finish report");
    expect(samples.slice(0, 2).map((s) => s.reasoningType)).toEqual(["plan_optimism", "gut_feel"]);
    expect(texts).toContain("gym 12x");
  });

  it("caps the sample at MAX_REASONING_SAMPLES", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      pred(0.9, false, { reasoningType: `t${i}`, reasoning: `r${i}`, text: `p${i}` }),
    );
    expect(buildScopeStats(many, "lifetime").samples).toHaveLength(MAX_REASONING_SAMPLES);
  });
});

describe("buildScopeStats — reasoning groups (example-anchored)", () => {
  it("groups predictions by reasoning kind, carrying hit/miss example titles, sorted by size", () => {
    const preds = [
      pred(0.9, true, { reasoningType: "trust_in_person", text: "teammate ships" }),
      pred(0.8, true, { reasoningType: "trust_in_person", text: "candidate accepts" }),
      pred(0.7, false, { reasoningType: "trust_in_person", text: "vendor delivers" }),
      pred(0.9, false, { reasoningType: "plan_optimism", text: "finish the module" }),
      pred(0.85, false, { reasoningType: "plan_optimism", text: "meditation streak" }),
    ];
    const groups = buildScopeStats(preds, "lifetime").reasoningGroups;
    const trust = groups.find((g) => g.key === "trust_in_person")!;
    const plan = groups.find((g) => g.key === "plan_optimism")!;

    expect(trust).toMatchObject({ n: 3, hits: 2 });
    expect(trust.hitExamples).toContain("teammate ships");
    expect(trust.missExamples).toContain("vendor delivers");
    expect(plan).toMatchObject({ n: 2, hits: 0 });
    expect(groups[0].key).toBe("trust_in_person"); // biggest group leads
    expect(trust.gloss.length).toBeGreaterThan(0); // internal grouping hint present
  });

  it("caps examples per side at MAX_GROUP_EXAMPLES", () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      pred(0.9, true, { reasoningType: "gut_feel", text: `p${i}` }),
    );
    const group = buildScopeStats(many, "lifetime").reasoningGroups[0];
    expect(group.hitExamples.length).toBeLessThanOrEqual(MAX_GROUP_EXAMPLES);
  });
});

describe("buildScopeStats — chart data (gated to the on-page charts)", () => {
  const unlocked = [...series(15, 0.9, () => true), ...series(15, 0.1, () => false)]; // 30 resolved

  it("provides curve buckets + progress once the charts unlock", () => {
    const chart = buildScopeStats(unlocked, "lifetime").chart;
    expect(chart.curveBuckets.length).toBeGreaterThan(0);
    expect(chart.progress).not.toBeNull();
  });

  it("withholds a locked chart so the insight can't reference it", () => {
    const chart = buildScopeStats(series(12, 0.7, (i) => i % 2 === 0), "lifetime").chart;
    expect(chart.curveBuckets).toEqual([]);
    expect(chart.progress).toBeNull();
  });

  it("computes chart facts from the lifetime record, identical across scopes", () => {
    // The on-page charts are lifetime; a recent/category insight references the
    // same charts, so the chart data must not vary with the insight's scope.
    expect(buildScopeStats(unlocked, "recent").chart).toEqual(
      buildScopeStats(unlocked, "lifetime").chart,
    );
  });
});

describe("categoryMenu", () => {
  const preds = [
    ...series(12, 0.7, (i) => i % 2 === 0).map((p) => ({ ...p, category: "work" })), // unlocked
    ...series(8, 0.7, (i) => i % 2 === 0).map((p) => ({ ...p, category: "health" })), // locked
    // money, relationships, self: no predictions → count 0
  ];

  it("lists EVERY category (even zero-count) with progress, unlock flag, and label", () => {
    const menu = categoryMenu(preds);
    expect(menu.map((m) => m.category).sort()).toEqual([
      "health",
      "money",
      "relationships",
      "self",
      "work",
    ]);

    const work = menu.find((m) => m.category === "work")!;
    const health = menu.find((m) => m.category === "health")!;
    const money = menu.find((m) => m.category === "money")!;

    expect(work).toMatchObject({ n: 12, unlocked: true, scope: "category:work", label: "Work (12)" });
    expect(health).toMatchObject({ n: 8, unlocked: false, label: "Health (8 of 10)" });
    expect(money).toMatchObject({ n: 0, unlocked: false, label: "Money (0 of 10)" });
    expect(CATEGORY_UNLOCK_N).toBe(10);
  });

  it("sorts by count so the closest-to-unlocking lead", () => {
    expect(categoryMenu(preds)[0].category).toBe("work"); // 12, the richest
  });

  it("exposes the gate tooltip copy for the info control", () => {
    expect(CATEGORY_GATE_TOOLTIP).toBe(
      "Category insights need 10 resolved predictions in a single category.",
    );
  });
});

describe("no reasoning-type jargon in user-facing strings", () => {
  // The reasoning taxonomy is internal — it drives the AI analysis but its enum
  // values and coined names must never reach a rendered surface (extends the
  // no-jargon discipline of boldnessSentence to the reasoning types).
  const TOKENS = [
    ...enrichReasoningTypeValues,
    ...enrichReasoningTypeValues.map((v) => v.replace(/_/g, " ")),
  ];

  it("no card / menu / tooltip string contains a reasoning_type value or coined name", () => {
    const preds: InsightPrediction[] = [
      ...series(15, 0.9, (i) => i % 2 === 0).map((p) => ({
        ...p,
        category: "work",
        reasoningType: "plan_optimism",
      })),
      ...series(12, 0.6, (i) => i % 2 === 0).map((p) => ({
        ...p,
        category: "health",
        reasoningType: "gut_feel",
      })),
    ];

    const strings: string[] = [CATEGORY_GATE_TOOLTIP];
    for (const scope of ["recent", "lifetime", "category:work"] as const) {
      const card = buildScopedInsightCard(buildScopeStats(preds, scope), null, 0);
      strings.push(
        card.label,
        card.toggleLabel,
        card.fallbackText,
        card.insufficientReason ?? "",
        card.currentStatusLine ?? "",
        card.staleMessage ?? "",
      );
    }
    for (const m of categoryMenu(preds)) strings.push(m.label);

    const joined = strings.join(" | ").toLowerCase();
    for (const token of TOKENS) expect(joined).not.toContain(token);
  });
});

describe("scopeLabel", () => {
  it("names the slice and its size, including a category", () => {
    const preds = series(24, 0.7, (i) => i % 2 === 0).map((p) => ({ ...p, category: "work" }));
    expect(scopeLabel(buildScopeStats(preds, "lifetime"))).toBe("Lifetime — all 24 resolutions");
    expect(scopeLabel(buildScopeStats(preds, "recent"))).toBe(
      `Recent — last ${ROLLING_WINDOW} resolutions`,
    );
    expect(scopeLabel(buildScopeStats(preds, "category:work"))).toBe("Work — 24 resolutions");
  });
});

describe("buildScopeFallback", () => {
  it("is the templated Brier + bias sentences when data exists", () => {
    const s = buildScopeStats(series(20, 0.9, (i) => i % 2 === 0), "lifetime");
    const fallback = buildScopeFallback(s);
    expect(fallback).toContain("Brier");
    expect(fallback.toLowerCase()).toContain("overconfident");
  });

  it("degrades to a plain line when the scope is empty", () => {
    expect(buildScopeFallback(buildScopeStats([], "lifetime"))).toBe(
      "No resolutions in this scope yet.",
    );
  });
});

describe("insightFreshness", () => {
  const V = SCOPED_INSIGHT_PROMPT_VERSION;
  const cached: CachedInsight = { scope: "lifetime", bodyText: "x", nResolvedAtGeneration: 20, promptVersion: V };

  it("absent when nothing is cached", () => {
    expect(insightFreshness(null, 20, V)).toBe("absent");
  });
  it("fresh only when the count AND the prompt version match", () => {
    expect(insightFreshness(cached, 20, V)).toBe("fresh");
  });
  it("stale the moment the resolved count changes", () => {
    expect(insightFreshness(cached, 21, V)).toBe("stale");
    expect(insightFreshness(cached, 19, V)).toBe("stale");
  });
  it("stale when the prompt version advanced, even with the same count", () => {
    expect(insightFreshness({ ...cached, promptVersion: V - 1 }, 20, V)).toBe("stale");
  });
});

describe("buildScopedInsightCard", () => {
  const V = SCOPED_INSIGHT_PROMPT_VERSION;
  const enough = [...series(15, 0.9, () => true), ...series(15, 0.1, () => false)];
  const stats = buildScopeStats(enough, "lifetime");

  function cached(overrides: Partial<CachedInsight> = {}): CachedInsight {
    return { scope: "lifetime", bodyText: "cached", nResolvedAtGeneration: stats.n, promptVersion: V, ...overrides };
  }

  it("absent cache → offers Generate, shows fallback, carries scope labels", () => {
    const card = buildScopedInsightCard(stats, null, 0);
    expect(card.freshness).toBe("absent");
    expect(card.canGenerate).toBe(true);
    expect(card.cachedText).toBeNull();
    expect(card.fallbackText).not.toHaveLength(0);
    expect(card.kind).toBe("lifetime");
    expect(card.toggleLabel).toBe("Lifetime");
  });

  it("current (fresh) → shows a data-limit status line and offers NO regeneration", () => {
    const card = buildScopedInsightCard(stats, cached(), 0);
    expect(card.freshness).toBe("fresh");
    expect(card.cachedText).toBe("cached");
    expect(card.canGenerate).toBe(false); // same data ⇒ same analysis; no reroll
    expect(card.staleMessage).toBeNull();
    expect(card.currentStatusLine).toBe(
      `Based on all ${stats.n} of your resolved predictions. A new analysis becomes available once you resolve more.`,
    );
  });

  it("stale by NEW RESOLUTIONS → count message + enabled Regenerate", () => {
    const card = buildScopedInsightCard(stats, cached({ nResolvedAtGeneration: stats.n - 3 }), 0);
    expect(card.freshness).toBe("stale");
    expect(card.canGenerate).toBe(true);
    expect(card.newSinceCached).toBe(3);
    expect(card.staleMessage).toBe("3 new resolutions since this was written. Regenerate for the latest.");
    expect(card.currentStatusLine).toBeNull();
  });

  it("stale by PROMPT VERSION → improved-insight message + enabled Regenerate (no count)", () => {
    const card = buildScopedInsightCard(stats, cached({ promptVersion: V - 1 }), 0);
    expect(card.freshness).toBe("stale");
    expect(card.canGenerate).toBe(true);
    expect(card.newSinceCached).toBe(0);
    expect(card.staleMessage).toBe("An improved insight is available. Regenerate to update.");
  });

  it("over cap → disables the action but still shows the cached text", () => {
    const card = buildScopedInsightCard(stats, cached({ nResolvedAtGeneration: stats.n - 1 }), DAILY_AI_CALL_CAP);
    expect(card.overCap).toBe(true);
    expect(card.canGenerate).toBe(false);
    expect(card.cachedText).toBe("cached");
  });

  it("the daily cap is per USER — it blocks every scope, so rapid scope-switching can't bypass it", () => {
    // The page passes the same per-user callsToday to every scope's card, so an
    // over-cap user is blocked on recent, lifetime, and every category alike.
    const recent = buildScopedInsightCard(buildScopeStats(enough, "recent"), null, DAILY_AI_CALL_CAP);
    const lifetime = buildScopedInsightCard(stats, null, DAILY_AI_CALL_CAP);
    expect(recent.canGenerate).toBe(false);
    expect(lifetime.canGenerate).toBe(false);
    expect(recent.overCap && lifetime.overCap).toBe(true);
  });

  it("insufficient data → no action, with a scope-specific honest reason", () => {
    const thinLifetime = buildScopeStats(series(5, 0.7, () => true), "lifetime");
    const lifeCard = buildScopedInsightCard(thinLifetime, null, 0);
    expect(lifeCard.insufficientData).toBe(true);
    expect(lifeCard.canGenerate).toBe(false);
    expect(lifeCard.insufficientReason).toContain("5");

    const thinCategory = buildScopeStats(
      series(3, 0.7, () => true).map((p) => ({ ...p, category: "money" })),
      "category:money",
    );
    const catCard = buildScopedInsightCard(thinCategory, null, 0);
    expect(catCard.insufficientReason).toBe(
      "A money insight needs 10 resolved predictions to avoid noise — you have 3.",
    );
  });
});
