import { describe, expect, it } from "vitest";
import {
  biasScore,
  BIAS_UNLOCK_N,
  boldness,
  boldnessSentence,
  brierScore,
  biasSentence,
  calibrationBuckets,
  CURVE_UNLOCK_N,
  ewmaBrierTrend,
  outcomeByStance,
  PROGRESS_UNLOCK_N,
  resolvedNonVoid,
  rollingBrier,
  runningBrier,
} from "@/lib/scoring";
import { buildInsightsViewModel, type CalibrationPoint, curveCaption, type InsightsInput } from "./insightsCore";

const CATEGORIES = ["work", "health"];
const REASONING_TYPES = ["gut_feel", "specific_evidence"];

/** A deterministic, varied resolved prediction — spreads confidence across deciles. */
function resolvedInput(i: number, overrides: Partial<InsightsInput> = {}): InsightsInput {
  return {
    id: `pred-${i}`,
    text: `Prediction ${i}`,
    confidence: 0.5 + (i % 5) * 0.1,
    outcome: i % 3 !== 0,
    status: "resolved",
    resolvedAt: new Date(Date.UTC(2026, 0, 1 + i)), // spread across January 2026
    category: CATEGORIES[i % CATEGORIES.length]!,
    reasoningType: REASONING_TYPES[i % REASONING_TYPES.length]!,
    ...overrides,
  };
}

function resolvedFixture(n: number): InsightsInput[] {
  return Array.from({ length: n }, (_, i) => resolvedInput(i));
}

describe("buildInsightsViewModel — lock-state thresholds", () => {
  it("bias unlocks exactly at BIAS_UNLOCK_N (9 locked, 10 unlocked)", () => {
    expect(buildInsightsViewModel(resolvedFixture(BIAS_UNLOCK_N - 1)).bias.unlocked).toBe(false);
    expect(buildInsightsViewModel(resolvedFixture(BIAS_UNLOCK_N)).bias.unlocked).toBe(true);
  });

  it("progress unlocks exactly at PROGRESS_UNLOCK_N (24 locked, 25 unlocked)", () => {
    expect(
      buildInsightsViewModel(resolvedFixture(PROGRESS_UNLOCK_N - 1)).progress.unlocked,
    ).toBe(false);
    expect(buildInsightsViewModel(resolvedFixture(PROGRESS_UNLOCK_N)).progress.unlocked).toBe(
      true,
    );
  });

  it("curve unlocks exactly at CURVE_UNLOCK_N (29 locked, 30 unlocked)", () => {
    expect(buildInsightsViewModel(resolvedFixture(CURVE_UNLOCK_N - 1)).curve.unlocked).toBe(
      false,
    );
    expect(buildInsightsViewModel(resolvedFixture(CURVE_UNLOCK_N)).curve.unlocked).toBe(true);
  });

  it("boldness rides the curve's gate — unlocks exactly at CURVE_UNLOCK_N (29 locked, 30 unlocked)", () => {
    expect(buildInsightsViewModel(resolvedFixture(CURVE_UNLOCK_N - 1)).boldness.unlocked).toBe(
      false,
    );
    expect(buildInsightsViewModel(resolvedFixture(CURVE_UNLOCK_N)).boldness.unlocked).toBe(
      true,
    );
  });

  it("boldness locks and unlocks in lockstep with the curve at every N", () => {
    for (const count of [0, 12, 25, 29, 30, 40]) {
      const vm = buildInsightsViewModel(resolvedFixture(count));
      expect(vm.boldness.unlocked).toBe(vm.curve.unlocked);
    }
  });

  it("locked boldness reports how many more resolutions are needed", () => {
    expect(buildInsightsViewModel(resolvedFixture(0)).boldness.unlockSentence).toBe(
      "30 more resolutions before this is meaningful.",
    );
    expect(buildInsightsViewModel(resolvedFixture(29)).boldness.unlockSentence).toBe(
      "1 more resolution before this is meaningful.",
    );
  });

  it("boldness past the gate but with no outcome variety is unlocked yet narrated, never a blank number", () => {
    // 30 all-YES resolutions: past the gate, but b̄=1 ⇒ nothing for confidence
    // to sort ⇒ boldness() is null. The card must show the degenerate sentence,
    // not a NaN/blank value or a false lock.
    const allYes = Array.from({ length: CURVE_UNLOCK_N }, (_, i) =>
      resolvedInput(i, { outcome: true }),
    );
    const vm = buildInsightsViewModel(allYes);
    expect(vm.boldness.unlocked).toBe(true);
    expect(vm.boldness.unlockSentence).toBeNull();
    expect(vm.boldness.value).toBeNull();
    expect(vm.boldness.sentence).toBe(
      "Every prediction so far resolved the same way — there's nothing yet for your confidence to sort.",
    );
    expect(JSON.stringify(vm.boldness)).not.toMatch(/NaN/);
  });

  it("the three gates are independent — n=15 unlocks bias only", () => {
    const vm = buildInsightsViewModel(resolvedFixture(15));
    expect(vm.bias.unlocked).toBe(true);
    expect(vm.progress.unlocked).toBe(false);
    expect(vm.curve.unlocked).toBe(false);
    expect(vm.progress.unlockSentence).toBe("15 of 25 resolutions until your progress chart unlocks.");
    expect(vm.curve.unlockSentence).toBe("15 of 30 resolutions until your curve unlocks.");
  });

  it("n=30 unlocks all three simultaneously", () => {
    const vm = buildInsightsViewModel(resolvedFixture(30));
    expect(vm.bias.unlocked).toBe(true);
    expect(vm.progress.unlocked).toBe(true);
    expect(vm.curve.unlocked).toBe(true);
  });
});

describe("buildInsightsViewModel — 0 resolutions", () => {
  it("is fully locked with null/empty stats and no NaN anywhere", () => {
    const vm = buildInsightsViewModel([]);

    expect(vm.n).toBe(0);

    expect(vm.bias.unlocked).toBe(false);
    expect(vm.bias.unlockSentence).toBe("0 of 10 resolutions until your bias score unlocks.");
    expect(vm.bias.value).toBeNull();
    expect(vm.bias.sentence).toBeNull();
    expect(vm.bias.byCategory).toEqual([]);

    expect(vm.curve.unlocked).toBe(false);
    expect(vm.curve.unlockSentence).toBe("0 of 30 resolutions until your curve unlocks.");
    expect(vm.curve.points).toEqual([]);

    expect(vm.progress.unlocked).toBe(false);
    expect(vm.progress.unlockSentence).toBe("0 of 25 resolutions until your progress chart unlocks.");
    expect(vm.progress.trend).toEqual([]);
    expect(vm.progress.last20).toBeNull();
    expect(vm.progress.sentence).toBeNull();

    expect(vm.boldness.unlocked).toBe(false);
    expect(vm.boldness.unlockSentence).toBe("30 more resolutions before this is meaningful.");
    expect(vm.boldness.value).toBeNull();
    expect(vm.boldness.sentence).toBeNull();

    expect(vm.runningBrier.value).toBeNull();
    expect(vm.runningBrier.sentence).toBeNull();

    expect(JSON.stringify(vm)).not.toMatch(/NaN/);
  });

  it("survives a history that is entirely open/void (still n=0)", () => {
    const preds: InsightsInput[] = [
      resolvedInput(0, { status: "void", outcome: null }),
      resolvedInput(1, { status: "open", outcome: null }),
    ];
    expect(buildInsightsViewModel(preds).n).toBe(0);
  });
});

describe("buildInsightsViewModel — 12 resolutions", () => {
  const preds: InsightsInput[] = [
    ...resolvedFixture(12),
    resolvedInput(100, { status: "void", outcome: null }),
    resolvedInput(101, { status: "open", outcome: null }),
  ];
  const vm = buildInsightsViewModel(preds);

  it("gates survive the full pipeline: void/open don't inflate n", () => {
    expect(vm.n).toBe(12);
  });

  it("bias is unlocked with the value/sentence computed by the scoring module", () => {
    const resolved = resolvedNonVoid(preds);
    expect(vm.bias.unlocked).toBe(true);
    expect(vm.bias.value).toBeCloseTo(biasScore(resolved)!, 12);
    expect(vm.bias.sentence).toBe(biasSentence(biasScore(resolved)!));
  });

  it("curve and progress stay locked with correct progress copy", () => {
    expect(vm.curve.unlocked).toBe(false);
    expect(vm.curve.unlockSentence).toBe("12 of 30 resolutions until your curve unlocks.");
    expect(vm.progress.unlocked).toBe(false);
    expect(vm.progress.unlockSentence).toBe("12 of 25 resolutions until your progress chart unlocks.");
  });

  it("boldness stays locked with an honest 'more resolutions' progress state", () => {
    expect(vm.boldness.unlocked).toBe(false);
    expect(vm.boldness.unlockSentence).toBe("18 more resolutions before this is meaningful.");
    expect(vm.boldness.value).toBeNull();
    expect(vm.boldness.sentence).toBeNull();
  });

  it("category breakdown row counts sum to the resolved-non-void population", () => {
    const total = resolvedNonVoid(preds).length;
    expect(vm.bias.byCategory.reduce((sum, r) => sum + r.n, 0)).toBe(total);
    expect(vm.bias.byCategory.length).toBeGreaterThanOrEqual(2);
  });

  it("does not expose a reasoning-type breakdown (its taxonomy stays internal)", () => {
    expect((vm.bias as Record<string, unknown>).byReasoningType).toBeUndefined();
  });
});

describe("buildInsightsViewModel — 40 resolutions", () => {
  const preds = resolvedFixture(40);
  const vm = buildInsightsViewModel(preds);
  const resolved = resolvedNonVoid(preds);

  it("all three sections are unlocked", () => {
    expect(vm.bias.unlocked).toBe(true);
    expect(vm.curve.unlocked).toBe(true);
    expect(vm.progress.unlocked).toBe(true);
    expect(vm.bias.unlockSentence).toBeNull();
    expect(vm.curve.unlockSentence).toBeNull();
    expect(vm.progress.unlockSentence).toBeNull();
  });

  it("progress.trend has one point per resolution", () => {
    expect(vm.progress.trend).toHaveLength(40);
  });

  it("boldness is unlocked with the value + sentence straight from the scoring module", () => {
    expect(vm.boldness.unlocked).toBe(true);
    expect(vm.boldness.unlockSentence).toBeNull();

    const expected = boldness(resolved);
    expect(expected).not.toBeNull();
    expect(vm.boldness.value).toBe(expected);
    // 0–1 scale, no inline math: the page prints exactly what scoring returned.
    expect(vm.boldness.value!).toBeGreaterThanOrEqual(0);
    expect(vm.boldness.value!).toBeLessThanOrEqual(1);
    expect(vm.boldness.sentence).toBe(boldnessSentence(expected!));
  });

  it("curve.points and progress.trend are not reinvented — the plotted geometry matches direct scoring calls", () => {
    // The x/y/n a dot is drawn at is exactly the scoring bucket; drill-down
    // fields (low/high/predictions) are annotations on top, not new geometry.
    const expectedPoints = calibrationBuckets(resolved).map((b) => ({
      x: b.meanConfidence,
      y: b.actualFrequency,
      n: b.n,
    }));
    expect(vm.curve.points.map((p) => ({ x: p.x, y: p.y, n: p.n }))).toEqual(expectedPoints);

    // The chart's Recent series is the EWMA trend, straight from scoring.
    const expectedTrend = ewmaBrierTrend(resolved);
    expect(vm.progress.trend.map((p) => ({ n: p.n, value: p.value }))).toEqual(expectedTrend);

    expect(vm.progress.last20).toBe(rollingBrier(resolved, 20));
    expect(vm.runningBrier.value).toBe(runningBrier(resolved));
  });

  it("curve drill-down: every resolution lands in exactly one band, in the same decile as the curve", () => {
    // Membership sums to n, and each member's confidence really falls in its
    // band — so the click panel can't disagree with the dot it hangs off.
    const totalMembers = vm.curve.points.reduce((sum, p) => sum + p.predictions.length, 0);
    expect(totalMembers).toBe(vm.n);

    for (const point of vm.curve.points) {
      expect(point.predictions).toHaveLength(point.n);
      for (const member of point.predictions) {
        const isTopBand = point.high === 1;
        expect(member.confidence).toBeGreaterThanOrEqual(point.low);
        expect(isTopBand ? member.confidence <= point.high : member.confidence < point.high).toBe(
          true,
        );
      }
    }
  });

  it("progress drill-down: each point ties back to its resolution, in chronological order", () => {
    expect(vm.progress.trend.map((p) => p.predictionId)).toEqual(resolved.map((p) => p.id));
    for (const point of vm.progress.trend) {
      const source = resolved[point.n - 1]!;
      expect(point.text).toBe(source.text);
      expect(point.brier).toBe(brierScore(source.confidence, source.outcome));
      expect(point.resolvedDate).toBe(source.resolvedAt.toISOString().slice(0, 10));
    }
  });

  it("progress lifetime series is the cumulative running Brier at each point", () => {
    for (const point of vm.progress.trend) {
      // The tab's 'lifetime' line must equal running Brier over the same prefix.
      expect(point.lifetime).toBeCloseTo(runningBrier(resolved.slice(0, point.n))!, 12);
    }
    // Its final value is lifetime running Brier over the whole history.
    expect(vm.progress.trend.at(-1)!.lifetime).toBeCloseTo(vm.runningBrier.value!, 12);
  });

  it("progress.sentence reports last-20 vs lifetime", () => {
    expect(vm.progress.sentence).toBe(
      `Last 20: ${vm.progress.last20!.toFixed(2)} vs ${vm.runningBrier.value!.toFixed(2)} lifetime.`,
    );
  });
});

describe("buildInsightsViewModel — recent vs lifetime progress series (the chart tab)", () => {
  // A varied history (confidence spread across deciles, mixed outcomes) — the
  // realistic case. The Recent (EWMA) series and the cumulative lifetime series
  // are what the tab flips between, and moving the whole line/dots is the fix.
  const varied = resolvedFixture(30);
  const vm = buildInsightsViewModel(varied);
  const resolved = resolvedNonVoid(varied);
  const trend = vm.progress.trend;

  it("recent (value) equals the scoring module's EWMA trend", () => {
    expect(trend.map((p) => ({ n: p.n, value: p.value }))).toEqual(ewmaBrierTrend(resolved));
  });

  it("has no structural dead region: recent departs from lifetime within the first 15 points", () => {
    // The original bug was a trailing-20 window, which is IDENTICAL to lifetime
    // for the first 20 points no matter the data — so the toggle looked dead.
    // EWMA departs as soon as recent results differ from the running mean.
    const earlyDeparture = trend
      .filter((pt) => pt.n <= 15)
      .some((pt) => Math.abs(pt.value - pt.lifetime) > 1e-6);
    expect(earlyDeparture).toBe(true);

    // And across the whole series the two views disagree at the vast majority
    // of points, so flipping the tab visibly moves the dots.
    const differing = trend.filter((pt) => Math.abs(pt.value - pt.lifetime) > 1e-6).length;
    expect(differing).toBeGreaterThan(trend.length * 0.6);
  });
});

describe("buildInsightsViewModel — decisions section (outcome × stance, docs §2.3)", () => {
  const decisionRow = (
    i: number,
    outcome: boolean,
    stance: string,
    overrides: Partial<InsightsInput> = {},
  ) => resolvedInput(i, { outcome, decision: `decision ${i}`, stance, ...overrides });

  it("is locked at zero decisions, with an honest count-based lock sentence (never a rate)", () => {
    const vm = buildInsightsViewModel([]);
    expect(vm.decisions.unlocked).toBe(false);
    expect(vm.decisions.unlockSentence).toBe(
      "0 of 10 met · 0 of 10 missed — both need 10 decisions with a recorded stance before this unlocks.",
    );
    expect(vm.decisions.met).toBeNull();
    expect(vm.decisions.missed).toBeNull();
    expect(vm.decisions.sentence).toBeNull();
  });

  it("stays locked when only one side clears BIAS_UNLOCK_N — the sentence quotes both, so both must be ready", () => {
    const preds: InsightsInput[] = [
      ...Array.from({ length: 12 }, (_, i) => decisionRow(i, true, "stand_by")), // met: 12, clears alone
      ...Array.from({ length: 9 }, (_, i) => decisionRow(100 + i, false, "stand_by")), // missed: 9, below the gate
    ];
    const vm = buildInsightsViewModel(preds);
    expect(vm.decisions.met).not.toBeNull();
    expect(vm.decisions.missed).toBeNull();
    expect(vm.decisions.unlocked).toBe(false);
    expect(vm.decisions.sentence).toBeNull();
    // Each side's real count, never a combined total that could read as "past done" while still locked.
    expect(vm.decisions.unlockSentence).toBe(
      "12 of 10 met · 9 of 10 missed — both need 10 decisions with a recorded stance before this unlocks.",
    );
  });

  it("unlocks once both sides clear BIAS_UNLOCK_N, matching outcomeByStance exactly", () => {
    const preds: InsightsInput[] = [
      ...Array.from({ length: 9 }, (_, i) => decisionRow(i, true, "stand_by")),
      ...Array.from({ length: 3 }, (_, i) => decisionRow(9 + i, true, "wouldnt_again")), // met: 12, 9 stand_by → 75%
      ...Array.from({ length: 4 }, (_, i) => decisionRow(20 + i, false, "stand_by")),
      ...Array.from({ length: 8 }, (_, i) => decisionRow(24 + i, false, "wouldnt_again")), // missed: 12, 4 stand_by → 33%
    ];
    const vm = buildInsightsViewModel(preds);
    const direct = outcomeByStance(preds);

    expect(vm.decisions.unlocked).toBe(true);
    expect(vm.decisions.unlockSentence).toBeNull();
    expect(vm.decisions.met).toEqual(direct.met);
    expect(vm.decisions.missed).toEqual(direct.missed);
    expect(vm.decisions.sentence).toBe(
      "Of decisions where your criterion was met, you'd make 75% again. Where it wasn't, 33%.",
    );
  });

  it("the rendered sentence never evaluates the decision itself (CLAUDE.md copy rule)", () => {
    const preds: InsightsInput[] = [
      ...Array.from({ length: 10 }, (_, i) => decisionRow(i, true, "stand_by")),
      ...Array.from({ length: 10 }, (_, i) => decisionRow(20 + i, false, "wouldnt_again")),
    ];
    const sentence = buildInsightsViewModel(preds).decisions.sentence!;
    expect(sentence).not.toMatch(
      /good call|bad call|right to|wrong to|should have|better decision|poor judgment/i,
    );
  });

  it("excludes voids, open rows, stance-less rows, and forecasts — same population outcomeByStance uses", () => {
    const preds: InsightsInput[] = [
      ...Array.from({ length: 10 }, (_, i) => decisionRow(i, true, "stand_by")),
      ...Array.from({ length: 10 }, (_, i) => decisionRow(20 + i, false, "stand_by")),
      decisionRow(200, true, "stand_by", { status: "void" }),
      resolvedInput(201, { outcome: false, decision: "x", stance: null }),
      resolvedInput(202, { outcome: true, decision: null, stance: "stand_by" }),
    ];
    const vm = buildInsightsViewModel(preds);
    expect(vm.decisions.met!.n).toBe(10);
    expect(vm.decisions.missed!.n).toBe(10);
  });

  it("does not expose a per-type (decision-vs-forecast) breakdown — byEntryType ships unrendered", () => {
    const vm = buildInsightsViewModel(resolvedFixture(12));
    expect((vm as unknown as Record<string, unknown>).byEntryType).toBeUndefined();
    expect((vm.decisions as Record<string, unknown>).byEntryType).toBeUndefined();
  });
});

describe("buildInsightsViewModel — determinism", () => {
  it("identical input produces deep-equal output", () => {
    const preds = resolvedFixture(20);
    expect(buildInsightsViewModel(preds)).toEqual(buildInsightsViewModel(preds));
  });
});

describe("curveCaption (shared evidence-band reading)", () => {
  const pt = (x: number, y: number): CalibrationPoint => ({
    x,
    y,
    n: 5,
    low: 0,
    high: 1,
    predictions: [],
  });

  it("returns null for an empty curve", () => {
    expect(curveCaption([])).toBeNull();
  });

  it("reads a mostly-below-the-line curve as happening less often than stated", () => {
    const caption = curveCaption([pt(0.7, 0.4), pt(0.8, 0.5), pt(0.9, 0.95)]);
    expect(caption).toContain("2 of your 3");
    expect(caption).toContain("below the line");
  });

  it("reads a mostly-above-the-line curve as happening more often than stated", () => {
    const caption = curveCaption([pt(0.3, 0.6), pt(0.4, 0.7), pt(0.6, 0.55)]);
    expect(caption).toContain("2 of your 3");
    expect(caption).toContain("above the line");
  });

  it("reads an evenly-split curve as tracking each other", () => {
    const caption = curveCaption([pt(0.3, 0.6), pt(0.8, 0.5)]);
    expect(caption).toContain("track each other");
  });

  it("treats a dot within the epsilon of the diagonal as on the line", () => {
    // Both dots essentially on the diagonal → neither below nor above → even.
    expect(curveCaption([pt(0.5, 0.502), pt(0.7, 0.699)])).toContain("track each other");
  });
});
