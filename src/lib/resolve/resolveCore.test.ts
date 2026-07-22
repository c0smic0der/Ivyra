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

describe("postmortemDecision — the cap fallback and skip branches", () => {
  const generate = {
    isVoid: false,
    hasReasoning: true,
    existingPostmortem: null,
    callsToday: 0,
  };

  it("generates when under cap with reasoning on a non-void resolution", () => {
    expect(postmortemDecision(generate)).toBe("generate");
  });

  it("falls back to over_cap at the daily cap (the graceful-degrade branch)", () => {
    expect(postmortemDecision({ ...generate, callsToday: 25 })).toBe("over_cap");
    expect(postmortemDecision({ ...generate, callsToday: 3, cap: 3 })).toBe("over_cap");
  });

  it("returns a stored post-mortem verbatim without regenerating or charging", () => {
    expect(
      postmortemDecision({ ...generate, existingPostmortem: "already written", callsToday: 25 }),
    ).toBe("return_stored");
  });

  it("skips Void and no-reasoning resolutions", () => {
    expect(postmortemDecision({ ...generate, isVoid: true })).toBe("skip");
    expect(postmortemDecision({ ...generate, hasReasoning: false })).toBe("skip");
  });
});
