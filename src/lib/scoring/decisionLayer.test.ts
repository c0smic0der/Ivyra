import { describe, expect, it } from "vitest";

import { byEntryType, outcomeByStance, type DecisionScorable } from "./index";

// Deterministic decision-layer scoring. Both functions reuse `resolvedNonVoid`
// (the single void/open gate) and are gated per group at BIAS_UNLOCK_N (10) —
// below it a group is null, never NaN and never a misleading zero.

const times = <T>(n: number, f: () => T): T[] => Array.from({ length: n }, f);

/** Terse builder for a decision-layer row; status defaults from the outcome. */
const d = (
  outcome: boolean | null,
  opts: {
    decision?: string | null;
    stance?: DecisionScorable["stance"];
    status?: DecisionScorable["status"];
    confidence?: number;
  } = {},
): DecisionScorable => ({
  confidence: opts.confidence ?? 0.7,
  outcome,
  status: opts.status ?? (outcome === null ? "open" : "resolved"),
  decision: opts.decision ?? null,
  stance: opts.stance ?? null,
});

describe("byEntryType", () => {
  it("computes decision and forecast groups independently, with deliberately different hit rates", () => {
    const rows: DecisionScorable[] = [
      // Decision entries: 6 hits / 4 misses at 0.8 → hitRate 0.6, brier 0.28.
      ...times(6, () => d(true, { decision: "took the job", confidence: 0.8 })),
      ...times(4, () => d(false, { decision: "took the job", confidence: 0.8 })),
      // Forecast entries: 3 hits / 7 misses at 0.5 → hitRate 0.3, brier 0.25.
      ...times(3, () => d(true, { confidence: 0.5 })),
      ...times(7, () => d(false, { confidence: 0.5 })),
      // Excluded: a void decision and an open forecast must not move any figure.
      d(true, { decision: "took the job", status: "void", confidence: 0.8 }),
      d(null, { confidence: 0.5 }),
    ];

    const result = byEntryType(rows);

    expect(result.decision).toEqual({
      n: 10,
      meanConfidence: expect.closeTo(0.8, 10),
      hitRate: expect.closeTo(0.6, 10),
      brier: expect.closeTo(0.28, 10),
    });
    expect(result.forecast).toEqual({
      n: 10,
      meanConfidence: expect.closeTo(0.5, 10),
      hitRate: expect.closeTo(0.3, 10),
      brier: expect.closeTo(0.25, 10),
    });
    // Independence: the two hit rates are genuinely different populations.
    expect(result.decision!.hitRate).not.toBe(result.forecast!.hitRate);
  });

  it("nulls a group below BIAS_UNLOCK_N — never NaN, never zero", () => {
    const rows: DecisionScorable[] = [
      // Only 9 decision entries → below the gate.
      ...times(9, () => d(true, { decision: "x", confidence: 0.8 })),
      // 10 forecast entries → unlocked.
      ...times(10, () => d(true, { confidence: 0.5 })),
    ];

    const result = byEntryType(rows);

    expect(result.decision).toBeNull();
    expect(result.forecast).not.toBeNull();
    expect(result.forecast!.n).toBe(10);
  });
});

describe("outcomeByStance", () => {
  it("splits met vs missed and computes each stand-by rate independently", () => {
    const rows: DecisionScorable[] = [
      // criterion-MET (outcome true): 7 stand_by, 2 wouldnt_again, 1 mixed → standByRate 0.7.
      ...times(7, () => d(true, { decision: "shipped it", stance: "stand_by" })),
      ...times(2, () => d(true, { decision: "shipped it", stance: "wouldnt_again" })),
      ...times(1, () => d(true, { decision: "shipped it", stance: "mixed" })),
      // criterion-MISSED (outcome false): 4 stand_by, 4 wouldnt_again, 2 mixed → standByRate 0.4.
      ...times(4, () => d(false, { decision: "shipped it", stance: "stand_by" })),
      ...times(4, () => d(false, { decision: "shipped it", stance: "wouldnt_again" })),
      ...times(2, () => d(false, { decision: "shipped it", stance: "mixed" })),
      // Excluded: void (non-verdict), stance-less decision, forecast (no decision), open.
      d(true, { decision: "shipped it", stance: "stand_by", status: "void" }),
      d(false, { decision: "shipped it", stance: null }),
      d(true, { decision: null, stance: "stand_by" }),
      d(null, { decision: "shipped it", stance: "stand_by" }),
    ];

    const result = outcomeByStance(rows);

    expect(result.met).toEqual({ n: 10, standByRate: expect.closeTo(0.7, 10) });
    expect(result.missed).toEqual({ n: 10, standByRate: expect.closeTo(0.4, 10) });
    expect(result.met!.standByRate).not.toBe(result.missed!.standByRate);
  });

  it("excludes voids, open rows, stance-less rows, and forecasts from both groups", () => {
    const rows: DecisionScorable[] = [
      ...times(10, () => d(true, { decision: "a", stance: "stand_by" })),
      ...times(10, () => d(false, { decision: "a", stance: "stand_by" })),
      // These four must not inflate n on either side.
      d(true, { decision: "a", stance: "stand_by", status: "void" }),
      d(false, { decision: "a", stance: null }),
      d(true, { decision: null, stance: "stand_by" }),
      d(null, { decision: "a", stance: "stand_by" }),
    ];

    const result = outcomeByStance(rows);

    expect(result.met!.n).toBe(10);
    expect(result.missed!.n).toBe(10);
  });

  it("nulls each group below BIAS_UNLOCK_N independently — never NaN, never zero", () => {
    const rows: DecisionScorable[] = [
      // 9 met → below gate; 10 missed → unlocked.
      ...times(9, () => d(true, { decision: "a", stance: "stand_by" })),
      ...times(10, () => d(false, { decision: "a", stance: "stand_by" })),
    ];

    const result = outcomeByStance(rows);

    expect(result.met).toBeNull();
    expect(result.missed).toEqual({ n: 10, standByRate: expect.closeTo(1, 10) });
  });
});
