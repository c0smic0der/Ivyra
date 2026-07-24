import { describe, expect, it } from "vitest";
import { evaluateInsight, rubricInputFromStats } from "@/lib/ai/insightEval";
import { buildScopedInsightPrompt, runInsightWithRepair, type ScopeStats } from "@/lib/ai/scopedInsightCore";

// Golden fixture: a miscalibrated user whose plan-optimism justifications precede
// misses while their evidence-based ones hit — the exact shape the actionable
// insight is meant to surface. Every figure/prediction the rubric checks against
// is derived from this via rubricInputFromStats.
const GOLDEN: ScopeStats = {
  scope: "lifetime",
  n: 34,
  profile: "miscalibrated",
  brier: 0.29,
  bias: 0.19,
  boldness: 0.4,
  // Grouped by reasoning kind, but presented as EXAMPLE predictions — the insight
  // anchors to these titles, not to a paraphrased category.
  reasoningGroups: [
    {
      key: "plan_optimism",
      gloss: "the reason was their own intention or plan to follow through",
      n: 13,
      hits: 4,
      hitExamples: ["ship the redesign on time"],
      missExamples: ["finish the online course module", "keep a 7-day meditation streak"],
    },
    {
      key: "trust_in_person",
      gloss: "the reason rested on trust in a specific person's reliability or track record",
      n: 6,
      hits: 4,
      hitExamples: ["my teammate's delivery lands", "the candidate accepts the offer"],
      missExamples: ["the vendor delivers in Q3"],
    },
  ],
  byCategory: [{ key: "work", n: 20, hits: 10, meanConfidence: 0.78, hitRate: 0.5, bias: 0.28 }],
  samples: [
    {
      text: "I'll ship the redesign by the 15th",
      reasoningType: "plan_optimism",
      confidencePercent: 85,
      outcome: false,
      reasoning: "I'll make time for it once the sprint calms down",
      outcomeNote: "The sprint never calmed down",
    },
  ],
  // A curve dot below the diagonal in the high-confidence band, and a recent
  // Brier below lifetime — both real, so the STRONG insight may reference them.
  chart: {
    curveBuckets: [
      { center: 0.85, hitRate: 0.5, n: 12 },
      { center: 0.6, hitRate: 0.6, n: 8 },
    ],
    progress: { recent: 0.22, lifetime: 0.29 },
  },
};

const RUBRIC = rubricInputFromStats(GOLDEN);

// The kind of insight the reworked prompt is meant to produce: anchored to their
// OWN example predictions, sparse numbers, a SUPPORTED chart observation, and a
// concrete process fix — never a label, never a bias-point figure, never "move
// the number".
const STRONG_INSIGHT =
  "You're good at reading other people — you called your teammate's delivery and the candidate accepting, and you were right about 4 of 6 of those. Predictions about yourself are where it slips: \"finish the online course module\" and \"keep a 7-day meditation streak\" both missed, and both times you reasoned from the plan you'd made rather than what usually happens when you make plans like that. That's why your high-confidence dots sit below the line on the curve above — those are mostly the ones about your own follow-through. Before your next prediction that leans on your own plan, start from your track record on those, not the plan itself.";

describe("rubricInputFromStats", () => {
  it("whitelists the figures, example predictions, and chart features actually supplied", () => {
    expect(RUBRIC.reasoningTypeKeys).toContain("plan_optimism");
    expect(RUBRIC.figures).toContain("31%"); // plan-optimism group 4/13
    expect(RUBRIC.figures).toContain("67%"); // trust group 4/6
    expect(RUBRIC.figures).toContain("n=13");
    expect(RUBRIC.predictionTexts).toContain("finish the online course module");
    expect(RUBRIC.chart.curveBelowLine).toBe(true);
    expect(RUBRIC.chart.curveAboveLine).toBe(false);
    expect(RUBRIC.chart.progressImproving).toBe(true);
  });
});

describe("evaluateInsight — golden output passes", () => {
  it("accepts an insight anchored to real predictions, sparse, with a supported chart claim", () => {
    const r = evaluateInsight(STRONG_INSIGHT, RUBRIC);
    expect(r.failures).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.citesConcretePrediction).toBe(true);
    expect(r.noReasoningTypeLabel).toBe(true);
    expect(r.noBiasPoints).toBe(true);
    expect(r.chartClaimsSupported).toBe(true);
  });
});

describe("evaluateInsight — the metric-gaming failures are rejected", () => {
  it("rejects the bare 'you're overconfident, lower your numbers' insight", () => {
    const weak = "You run 19 points overconfident. Consider lowering your confidence going forward.";
    const r = evaluateInsight(weak, RUBRIC);
    expect(r.passed).toBe(false);
    // It fails on every axis that matters: no reasoning pattern, no own data,
    // no behavior, and it IS a number prescription.
    expect(r.namesReasoningPattern).toBe(false);
    expect(r.citesOwnData).toBe(false);
    expect(r.prescribesBehavior).toBe(false);
    expect(r.notNumberPrescription).toBe(false);
  });

  it("rejects a number prescription that also leaks a reasoning-type LABEL", () => {
    // Doubly wrong: the takeaway just "moves the number", AND it names the
    // internal taxonomy ("plan optimism") the user should never see.
    const sneaky = "Your plan optimism predictions only hit 31%, so shift your high-confidence calls down.";
    const r = evaluateInsight(sneaky, RUBRIC);
    expect(r.citesOwnData).toBe(true);
    expect(r.notNumberPrescription).toBe(false); // caught: number prescription
    expect(r.noReasoningTypeLabel).toBe(false); // caught: leaked label
    expect(r.passed).toBe(false);
  });

  it("rejects generic advice that would read the same for any user", () => {
    const generic = "Be more disciplined about your evidence and think carefully before you predict.";
    const r = evaluateInsight(generic, RUBRIC);
    expect(r.citesOwnData).toBe(false); // no figure, no prediction of theirs
    expect(r.passed).toBe(false);
  });
});

describe("evaluateInsight — each axis in isolation", () => {
  it("namesReasoningPattern keys off reasoning-type labels or reasoning vocabulary", () => {
    expect(evaluateInsight("your plan optimism calls slip", RUBRIC).namesReasoningPattern).toBe(true);
    expect(evaluateInsight("your justification style matters", RUBRIC).namesReasoningPattern).toBe(true);
    expect(evaluateInsight("your Tuesdays are unlucky", RUBRIC).namesReasoningPattern).toBe(false);
  });

  it("citesOwnData needs a supplied figure or a supplied prediction", () => {
    expect(evaluateInsight("you hit 67% there", RUBRIC).citesOwnData).toBe(true);
    expect(evaluateInsight("the redesign prediction missed", RUBRIC).citesOwnData).toBe(true);
    expect(evaluateInsight("you tend to be optimistic", RUBRIC).citesOwnData).toBe(false);
  });

  it("prescribesBehavior needs a concrete process cue, not just 'consider'", () => {
    expect(evaluateInsight("before the next one, ask who else must deliver", RUBRIC).prescribesBehavior).toBe(
      true,
    );
    expect(evaluateInsight("consider being more careful", RUBRIC).prescribesBehavior).toBe(false);
  });

  it("citesSampleSize needs a raw count behind a rate, not a bare percentage", () => {
    expect(evaluateInsight("your intention-based calls hit 4 of 13 there", RUBRIC).citesSampleSize).toBe(true);
    expect(evaluateInsight("those (4/13) slipped", RUBRIC).citesSampleSize).toBe(true);
    expect(evaluateInsight("n=13 of those missed", RUBRIC).citesSampleSize).toBe(true);
    expect(evaluateInsight("those hit just 31%", RUBRIC).citesSampleSize).toBe(false);
  });

  it("noReasoningTypeLabel fails when a coined type term or enum value appears", () => {
    // Every internal label form is caught; the plain-language description passes.
    expect(evaluateInsight("your plan optimism predictions slip", RUBRIC).noReasoningTypeLabel).toBe(false);
    expect(evaluateInsight("your gut_feel calls miss", RUBRIC).noReasoningTypeLabel).toBe(false);
    expect(evaluateInsight("your specific evidence calls hold", RUBRIC).noReasoningTypeLabel).toBe(false);
    expect(
      evaluateInsight("when your reason is your own intention to follow through", RUBRIC).noReasoningTypeLabel,
    ).toBe(true);
  });

  it("citesConcretePrediction requires an actual prediction of theirs, not just a figure", () => {
    expect(evaluateInsight("your meditation streak prediction slipped", RUBRIC).citesConcretePrediction).toBe(
      true,
    );
    expect(evaluateInsight("you were right about two-thirds of the time", RUBRIC).citesConcretePrediction).toBe(
      false,
    );
  });

  it("noBiasPoints fails on a bias-point figure in the prose", () => {
    expect(evaluateInsight("you run 17 points overconfident", RUBRIC).noBiasPoints).toBe(false);
    expect(evaluateInsight("you were right 4 of 6 times", RUBRIC).noBiasPoints).toBe(true);
  });

  it("chartClaimsSupported allows ONLY chart features the supplied numbers show", () => {
    // GOLDEN: a bucket below the line, none above, recent Brier better than lifetime.
    expect(evaluateInsight("your dots sit below the line there", RUBRIC).chartClaimsSupported).toBe(true);
    expect(evaluateInsight("your dots sit above the line there", RUBRIC).chartClaimsSupported).toBe(false);
    expect(evaluateInsight("your recent scores are coming down nicely", RUBRIC).chartClaimsSupported).toBe(true);
    expect(evaluateInsight("your scores are getting worse lately", RUBRIC).chartClaimsSupported).toBe(false);
    expect(evaluateInsight("your curve rises steeply near the top", RUBRIC).chartClaimsSupported).toBe(false);
    // Omitting chart commentary entirely is always fine.
    expect(evaluateInsight("no chart mention at all here", RUBRIC).chartClaimsSupported).toBe(true);
  });
});

// Opt-in live eval: runs the REAL model against the golden fixture and checks its
// output clears the rubric. Off by default (no network in CI); enable with
// RUN_AI_EVALS=1 and a valid ANTHROPIC_API_KEY.
const runLive = process.env.RUN_AI_EVALS === "1";
describe("evaluateInsight — live model (opt-in)", () => {
  (runLive ? it : it.skip)(
    "the model's own output on the golden fixture clears the rubric",
    async () => {
      const res = await runInsightWithRepair(buildScopedInsightPrompt(GOLDEN));
      expect(res.output).not.toBeNull();
      const r = evaluateInsight(res.output!.insight, rubricInputFromStats(GOLDEN));
      expect(r.passed, `failures: ${r.failures.join(", ")} | insight: ${res.output!.insight}`).toBe(true);
    },
    30_000,
  );
});
