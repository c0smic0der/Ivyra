import { describe, expect, it } from "vitest";
import { brierScore, resolvedNonVoid, runningBrier, type Scorable } from "@/lib/scoring";
import { computeResolution, computeUserStats, postmortemDecision } from "./resolveCore";

// Brier wiring: the resolution's Brier must be IDENTICAL to the scoring
// module's per-prediction Brier — resolve never re-implements the math.
describe("computeResolution — Brier comes from the scoring module", () => {
  it("YES scores (confidence - 1)^2 via scoring.brierScore", () => {
    const patch = computeResolution(0.9, "yes");
    expect(patch).toEqual({ status: "resolved", outcome: true, brierScore: brierScore(0.9, true) });
    expect(patch.brierScore).toBeCloseTo(0.01, 12);
  });

  it("NO scores (confidence - 0)^2 via scoring.brierScore", () => {
    const patch = computeResolution(0.9, "no");
    expect(patch).toEqual({ status: "resolved", outcome: false, brierScore: brierScore(0.9, false) });
    expect(patch.brierScore).toBeCloseTo(0.81, 12);
  });

  it("Void carries no outcome and no Brier", () => {
    expect(computeResolution(0.9, "void")).toEqual({
      status: "void",
      outcome: null,
      brierScore: null,
    });
  });
});

describe("computeUserStats — voids are excluded from the cached stats", () => {
  const base: Scorable[] = [
    { confidence: 0.9, outcome: true, status: "resolved" }, // brier 0.01
    { confidence: 0.2, outcome: false, status: "resolved" }, // brier 0.04
  ];

  it("counts only resolved non-void rows and averages their Brier", () => {
    const stats = computeUserStats(base);
    expect(stats.nResolved).toBe(2);
    expect(stats.runningBrier).toBeCloseTo((0.01 + 0.04) / 2, 12);
  });

  it("a void row changes neither the count nor the running Brier", () => {
    const withVoid: Scorable[] = [
      ...base,
      { confidence: 0.5, outcome: null, status: "void" },
    ];
    const before = computeUserStats(base);
    const after = computeUserStats(withVoid);
    expect(after.nResolved).toBe(before.nResolved);
    expect(after.runningBrier).toBe(before.runningBrier);
  });

  it("open rows are excluded too, and match the scoring module exactly", () => {
    const withOpen: Scorable[] = [...base, { confidence: 0.7, outcome: null, status: "open" }];
    const stats = computeUserStats(withOpen);
    expect(stats.nResolved).toBe(2);
    expect(stats.runningBrier).toBe(runningBrier(withOpen));
  });

  it("empty history yields no score", () => {
    expect(computeUserStats([])).toEqual({ nResolved: 0, runningBrier: null });
  });

  // The hardening invariant: n_resolved and the running Brier must always be
  // computed over the exact same population — the scoring module's single gate.
  it("the count and the Brier denominator agree on the same rows", () => {
    const mixed: Scorable[] = [
      { confidence: 0.9, outcome: true, status: "resolved" },
      { confidence: 0.5, outcome: null, status: "void" }, // excluded
      { confidence: 0.7, outcome: null, status: "open" }, // excluded
      { confidence: 0.3, outcome: false, status: "resolved" },
      { confidence: 0.6, outcome: true, status: "resolved" },
      { confidence: 0.1, outcome: null, status: "void" }, // excluded
    ];

    const stats = computeUserStats(mixed);
    const gated = resolvedNonVoid(mixed);

    // Count is exactly the gated population's size.
    expect(stats.nResolved).toBe(gated.length);
    expect(stats.nResolved).toBe(3);

    // The running Brier is the mean over that identical population — so the
    // count IS the Brier's denominator, not a parallel tally that could drift.
    const denominatorMean =
      gated.reduce((sum, p) => sum + brierScore(p.confidence, p.outcome), 0) / gated.length;
    expect(stats.runningBrier).toBeCloseTo(denominatorMean, 12);
    expect(stats.runningBrier).toBe(runningBrier(mixed));
  });
});

describe("postmortemDecision — the generate/skip/stored branches", () => {
  // The cap is no longer decided here — it's the route's atomic reservation. This
  // predicate only distinguishes stored / skip / generate; "over cap" surfaces as
  // a null reservation on a "generate" decision.
  const generate = {
    isVoid: false,
    hasReasoning: true,
    existingPostmortem: null,
  };

  it("generates with reasoning on a non-void, un-generated resolution", () => {
    expect(postmortemDecision(generate)).toBe("generate");
  });

  it("returns a stored post-mortem verbatim without regenerating or charging", () => {
    expect(postmortemDecision({ ...generate, existingPostmortem: "already written" })).toBe(
      "return_stored",
    );
    // Whitespace-only stored text is treated as absent, not a valid stored body.
    expect(postmortemDecision({ ...generate, existingPostmortem: "   " })).toBe("generate");
  });

  it("skips Void and no-reasoning resolutions", () => {
    expect(postmortemDecision({ ...generate, isVoid: true })).toBe("skip");
    expect(postmortemDecision({ ...generate, hasReasoning: false })).toBe("skip");
  });
});
