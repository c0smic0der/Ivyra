import { describe, expect, it } from "vitest";
import {
  biasScore,
  BIAS_UNLOCK_N,
  brierScore,
  brierSentence,
  biasSentence,
  calibrationBuckets,
  CURVE_UNLOCK_N,
  ewmaBrierTrend,
  PROGRESS_UNLOCK_N,
  resolvedNonVoid,
  rollingBrier,
  runningBrier,
} from "@/lib/scoring";
import { buildInsightsViewModel, type InsightsInput } from "./insightsCore";

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

const NOW = new Date(Date.UTC(2026, 0, 15)); // mid-January 2026, inside the fixtures' month

describe("buildInsightsViewModel — lock-state thresholds", () => {
  it("bias unlocks exactly at BIAS_UNLOCK_N (9 locked, 10 unlocked)", () => {
    expect(buildInsightsViewModel(resolvedFixture(BIAS_UNLOCK_N - 1), NOW).bias.unlocked).toBe(false);
    expect(buildInsightsViewModel(resolvedFixture(BIAS_UNLOCK_N), NOW).bias.unlocked).toBe(true);
  });

  it("progress unlocks exactly at PROGRESS_UNLOCK_N (24 locked, 25 unlocked)", () => {
    expect(
      buildInsightsViewModel(resolvedFixture(PROGRESS_UNLOCK_N - 1), NOW).progress.unlocked,
    ).toBe(false);
    expect(buildInsightsViewModel(resolvedFixture(PROGRESS_UNLOCK_N), NOW).progress.unlocked).toBe(
      true,
    );
  });

  it("curve unlocks exactly at CURVE_UNLOCK_N (29 locked, 30 unlocked)", () => {
    expect(buildInsightsViewModel(resolvedFixture(CURVE_UNLOCK_N - 1), NOW).curve.unlocked).toBe(
      false,
    );
    expect(buildInsightsViewModel(resolvedFixture(CURVE_UNLOCK_N), NOW).curve.unlocked).toBe(true);
  });

  it("the three gates are independent — n=15 unlocks bias only", () => {
    const vm = buildInsightsViewModel(resolvedFixture(15), NOW);
    expect(vm.bias.unlocked).toBe(true);
    expect(vm.progress.unlocked).toBe(false);
    expect(vm.curve.unlocked).toBe(false);
    expect(vm.progress.unlockSentence).toBe("15 of 25 resolutions until your progress chart unlocks.");
    expect(vm.curve.unlockSentence).toBe("15 of 30 resolutions until your curve unlocks.");
  });

  it("n=30 unlocks all three simultaneously", () => {
    const vm = buildInsightsViewModel(resolvedFixture(30), NOW);
    expect(vm.bias.unlocked).toBe(true);
    expect(vm.progress.unlocked).toBe(true);
    expect(vm.curve.unlocked).toBe(true);
  });
});

describe("buildInsightsViewModel — 0 resolutions", () => {
  it("is fully locked with null/empty stats and no NaN anywhere", () => {
    const vm = buildInsightsViewModel([], NOW);

    expect(vm.n).toBe(0);

    expect(vm.bias.unlocked).toBe(false);
    expect(vm.bias.unlockSentence).toBe("0 of 10 resolutions until your bias score unlocks.");
    expect(vm.bias.value).toBeNull();
    expect(vm.bias.sentence).toBeNull();
    expect(vm.bias.byCategory).toEqual([]);
    expect(vm.bias.byReasoningType).toEqual([]);

    expect(vm.curve.unlocked).toBe(false);
    expect(vm.curve.unlockSentence).toBe("0 of 30 resolutions until your curve unlocks.");
    expect(vm.curve.points).toEqual([]);

    expect(vm.progress.unlocked).toBe(false);
    expect(vm.progress.unlockSentence).toBe("0 of 25 resolutions until your progress chart unlocks.");
    expect(vm.progress.trend).toEqual([]);
    expect(vm.progress.last20).toBeNull();
    expect(vm.progress.sentence).toBeNull();

    expect(vm.runningBrier.value).toBeNull();
    expect(vm.runningBrier.sentence).toBeNull();

    expect(vm.monthlySummary.resolvedThisMonth).toBe(0);
    expect(vm.monthlySummary.paragraph).toBe("No resolutions yet this month.");

    expect(JSON.stringify(vm)).not.toMatch(/NaN/);
  });

  it("survives a history that is entirely open/void (still n=0)", () => {
    const preds: InsightsInput[] = [
      resolvedInput(0, { status: "void", outcome: null }),
      resolvedInput(1, { status: "open", outcome: null }),
    ];
    expect(buildInsightsViewModel(preds, NOW).n).toBe(0);
  });
});

describe("buildInsightsViewModel — 12 resolutions", () => {
  const preds: InsightsInput[] = [
    ...resolvedFixture(12),
    resolvedInput(100, { status: "void", outcome: null }),
    resolvedInput(101, { status: "open", outcome: null }),
  ];
  const vm = buildInsightsViewModel(preds, NOW);

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

  it("breakdown row counts sum to the resolved-non-void population", () => {
    const total = resolvedNonVoid(preds).length;
    expect(vm.bias.byCategory.reduce((sum, r) => sum + r.n, 0)).toBe(total);
    expect(vm.bias.byReasoningType.reduce((sum, r) => sum + r.n, 0)).toBe(total);
    expect(vm.bias.byCategory.length).toBeGreaterThanOrEqual(2);
    expect(vm.bias.byReasoningType.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buildInsightsViewModel — 40 resolutions", () => {
  const preds = resolvedFixture(40);
  const vm = buildInsightsViewModel(preds, NOW);
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
  const vm = buildInsightsViewModel(varied, NOW);
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

describe("buildInsightsViewModel — monthly summary", () => {
  it("counts and narrates only the in-month subset, not lifetime", () => {
    const july = [0, 1, 2, 3, 4].map((i) =>
      resolvedInput(i, { resolvedAt: new Date(Date.UTC(2026, 6, 10 + i)) }),
    );
    const january = [10, 11, 12].map((i) =>
      resolvedInput(i, { resolvedAt: new Date(Date.UTC(2026, 0, 10 + i)) }),
    );
    const preds = [...july, ...january];
    const now = new Date(Date.UTC(2026, 6, 22));

    const vm = buildInsightsViewModel(preds, now);

    expect(vm.monthlySummary.periodLabel).toBe("July 2026");
    expect(vm.monthlySummary.resolvedThisMonth).toBe(5);

    const julyResolved = resolvedNonVoid(july);
    const expectedParagraph = `${brierSentence(runningBrier(julyResolved)!)} ${biasSentence(
      biasScore(julyResolved)!,
    )}`;
    expect(vm.monthlySummary.paragraph).toBe(expectedParagraph);

    // Guard against the paragraph silently matching lifetime stats instead.
    const lifetimeResolved = resolvedNonVoid(preds);
    const lifetimeParagraph = `${brierSentence(runningBrier(lifetimeResolved)!)} ${biasSentence(
      biasScore(lifetimeResolved)!,
    )}`;
    expect(vm.monthlySummary.paragraph).not.toBe(lifetimeParagraph);
  });

  it("falls back gracefully when there's lifetime data but none this month", () => {
    const january = resolvedFixture(5); // all in January 2026
    const now = new Date(Date.UTC(2026, 6, 22)); // July 2026 — no overlap

    const vm = buildInsightsViewModel(january, now);
    expect(vm.monthlySummary.resolvedThisMonth).toBe(0);
    expect(vm.monthlySummary.paragraph).toBe("No resolutions yet this month.");
    expect(vm.monthlySummary.periodLabel).toBe("July 2026");
  });
});

describe("buildInsightsViewModel — determinism", () => {
  it("identical (preds, now) produce deep-equal output", () => {
    const preds = resolvedFixture(20);
    expect(buildInsightsViewModel(preds, NOW)).toEqual(buildInsightsViewModel(preds, NOW));
  });

  it("only monthlySummary changes when `now` moves to a different month", () => {
    const preds = resolvedFixture(20); // all in January 2026
    const vmJan = buildInsightsViewModel(preds, NOW);
    const vmJuly = buildInsightsViewModel(preds, new Date(Date.UTC(2026, 6, 15)));

    expect({ ...vmJan, monthlySummary: null }).toEqual({ ...vmJuly, monthlySummary: null });
    expect(vmJan.monthlySummary).not.toEqual(vmJuly.monthlySummary);
  });
});
