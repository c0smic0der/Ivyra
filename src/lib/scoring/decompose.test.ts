import { describe, expect, it } from "vitest";
import {
  boldness,
  brierScore,
  bucketIndex,
  calibrationBuckets,
  CURVE_UNLOCK_N,
  decompose,
  resolvedNonVoid,
  runningBrier,
  type Scorable,
} from "@/lib/scoring";
import { FIXTURE_12, FIXTURE_40, p, yesNo } from "./decompose.fixtures";

// The 12- and 40-prediction fixtures live in decompose.fixtures.ts — shared so
// the v3 Wilson / windowed-Murphy suites reuse the same shapes instead of
// keeping divergent copies. The fixtures below are specific to *this* suite's
// identity edge cases.
//
// CRITICAL invariant: the identity `brier = uncertainty − resolution +
// reliability` is EXACT (float tolerance) only when every occupied decile bucket
// holds a SINGLE distinct confidence value. If confidence varies within a
// bucket, the bucket's meanConfidence leaves a within-bin-variance residual (a
// real term, not float noise). The single-valued fixtures document the clean
// textbook case; FIXTURE_MIXED below exercises the residual — the normal case
// for real user data.

// Perfectly calibrated: every bucket's hit rate equals its (single) confidence,
// so reliability must be 0 to float. Confidences chosen to be exactly achievable.
//   bucket 2 (0.25): 4 preds, 1 YES → freq 0.25 = conf
//   bucket 5 (0.50): 4 preds, 2 YES → freq 0.50 = conf
//   bucket 7 (0.75): 4 preds, 3 YES → freq 0.75 = conf
const FIXTURE_CALIBRATED: Scorable[] = [
  ...yesNo(0.25, 1, 4),
  ...yesNo(0.5, 2, 4),
  ...yesNo(0.75, 3, 4),
];

// Mixed confidences WITHIN buckets — the normal case for real user data. Three
// distinct confidences share each decile, so meanConfidence ≠ each fᵢ and the
// textbook 3-term identity leaves a within-bin-variance residual.
//   bucket 3 (0.30s): 0.31, 0.35, 0.39
//   bucket 7 (0.70s): 0.71, 0.74, 0.78
//   bucket 8 (0.80s): 0.82, 0.86, 0.88
const FIXTURE_MIXED: Scorable[] = [
  p(0.31, false), p(0.35, true), p(0.39, false),
  p(0.71, true), p(0.74, false), p(0.78, true),
  p(0.82, true), p(0.86, true), p(0.88, false),
];

// Independent re-computation of the identity's RHS from decompose's outputs.
const identityRHS = (d: { uncertainty: number; resolution: number; reliability: number }) =>
  d.uncertainty - d.resolution + d.reliability;

/**
 * The within-bin-variance residual, computed directly from the raw predictions —
 * NOT from decompose's output, so it's an independent cross-check. Derivation:
 * expanding (fᵢ − oᵢ)² around each bucket's mean confidence conf̄ₖ leaves, beyond
 * the three Murphy terms, the per-prediction term (fᵢ − conf̄ₖ)² − 2(fᵢ − conf̄ₖ)·oᵢ
 * (the cross term −2(fᵢ−conf̄ₖ)oᵢ vanishes only when confidence is constant in the
 * bucket). Averaged over N, this is exactly `brier − (uncertainty − resolution +
 * reliability)`.
 */
const withinBinResidual = (preds: Scorable[]): number => {
  const resolved = resolvedNonVoid(preds);
  const meanConfByIndex = new Map(
    calibrationBuckets(preds).map((b) => [b.index, b.meanConfidence]),
  );
  let sum = 0;
  for (const pred of resolved) {
    const confBar = meanConfByIndex.get(bucketIndex(pred.confidence))!;
    const d = pred.confidence - confBar;
    const o = pred.outcome ? 1 : 0;
    sum += d * d - 2 * d * o;
  }
  return sum / resolved.length;
};

describe("decompose (Murphy: uncertainty / resolution / reliability)", () => {
  describe("(a) identity: brier ≈ uncertainty − resolution + reliability", () => {
    // Asserted on EVERY fixture — two independent computations (raw Brier vs the
    // decomposition over buckets) cross-checking Brier, bucketing and the split.
    const cases: Array<[string, Scorable[]]> = [
      ["FIXTURE_12", FIXTURE_12],
      ["FIXTURE_40", FIXTURE_40],
      ["FIXTURE_CALIBRATED", FIXTURE_CALIBRATED],
    ];
    it.each(cases)("holds to float tolerance on %s", (_name, preds) => {
      const d = decompose(preds)!;
      const brier = runningBrier(preds)!;
      expect(identityRHS(d)).toBeCloseTo(brier, 12);
    });

    it("holds on a minimal two-bucket set", () => {
      const preds = [p(0.35, true), p(0.35, false), p(0.85, true), p(0.85, true)];
      const d = decompose(preds)!;
      expect(identityRHS(d)).toBeCloseTo(runningBrier(preds)!, 12);
    });

    it("mixed confidences within buckets → exact identity WITH the residual term", () => {
      // The production path: real data mixes confidences inside a decile, so the
      // 3-term identity is short by the within-bin-variance residual. The full
      // identity brier === uncertainty − resolution + reliability + residual is
      // exact. This is the case the single-valued fixtures deliberately can't
      // reach, so it exercises meanConfidence ≠ fᵢ end-to-end.
      const d = decompose(FIXTURE_MIXED)!;
      const residual = withinBinResidual(FIXTURE_MIXED);

      // The residual is genuinely non-zero — otherwise this degenerates to the
      // single-valued case and proves nothing.
      expect(Math.abs(residual)).toBeGreaterThan(1e-6);

      expect(identityRHS(d) + residual).toBeCloseTo(runningBrier(FIXTURE_MIXED)!, 12);
    });

    it("without the residual, mixed buckets do NOT satisfy the 3-term identity", () => {
      // Guards the premise of the residual test: confirms the plain 3-term form
      // really is off here (so the residual term is doing real work, not padding).
      const d = decompose(FIXTURE_MIXED)!;
      expect(identityRHS(d)).not.toBeCloseTo(runningBrier(FIXTURE_MIXED)!, 6);
    });
  });

  it("(b) hedger — all predictions in one confidence bucket → resolution === 0 exactly", () => {
    // Single occupied bucket ⇒ its freq equals the overall YES rate ⇒ the sole
    // (freqₖ − b̄)² term is exactly 0. Not approximately: exactly.
    const preds = [p(0.7, true), p(0.7, false), p(0.7, true), p(0.7, false), p(0.7, true)];
    expect(calibrationBuckets(preds)).toHaveLength(1); // guard the premise
    const d = decompose(preds)!;
    expect(d.resolution).toBe(0);
  });

  it("(c) all-YES history → b̄ = 1 → uncertainty === 0", () => {
    const preds = [p(0.6, true), p(0.8, true), p(0.9, true)];
    const d = decompose(preds)!;
    expect(d.uncertainty).toBe(0);
  });

  it("(c') all-NO history → b̄ = 0 → uncertainty === 0", () => {
    const preds = [p(0.6, false), p(0.8, false), p(0.9, false)];
    expect(decompose(preds)!.uncertainty).toBe(0);
  });

  describe("(d) empty / void-only input → null, never NaN", () => {
    it("returns null on empty input", () => {
      expect(decompose([])).toBeNull();
    });

    it("returns null when everything is void/open (nothing resolved)", () => {
      expect(decompose([p(0.9, null, "void"), p(0.5, null, "open")])).toBeNull();
    });

    it("no component is NaN on any real fixture", () => {
      const d = decompose(FIXTURE_40)!;
      expect(Number.isNaN(d.uncertainty)).toBe(false);
      expect(Number.isNaN(d.resolution)).toBe(false);
      expect(Number.isNaN(d.reliability)).toBe(false);
    });
  });

  it("(e) perfectly-calibrated fixture → reliability ≈ 0", () => {
    expect(decompose(FIXTURE_CALIBRATED)!.reliability).toBeCloseTo(0, 12);
  });

  it("excludes voids/open exactly like the other aggregates", () => {
    const clean = resolvedNonVoid(FIXTURE_12);
    expect(decompose(FIXTURE_12)).toEqual(decompose(clean));
  });

  it("all three components are non-negative", () => {
    for (const preds of [FIXTURE_12, FIXTURE_40, FIXTURE_CALIBRATED]) {
      const d = decompose(preds)!;
      expect(d.uncertainty).toBeGreaterThanOrEqual(0);
      expect(d.resolution).toBeGreaterThanOrEqual(0);
      expect(d.reliability).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("boldness (resolution / uncertainty, gated + guarded)", () => {
  it("equals resolution / uncertainty on a fixture past the gate", () => {
    const d = decompose(FIXTURE_40)!;
    expect(resolvedNonVoid(FIXTURE_40).length).toBeGreaterThanOrEqual(CURVE_UNLOCK_N);
    expect(boldness(FIXTURE_40)).toBeCloseTo(d.resolution / d.uncertainty, 12);
  });

  it("lands within [0, 1]", () => {
    const b = boldness(FIXTURE_40)!;
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(1);
  });

  it("gates: returns null below the calibration-curve sample threshold", () => {
    const justUnder = Array.from({ length: CURVE_UNLOCK_N - 1 }, (_, i) => p(0.7, i % 2 === 0));
    expect(resolvedNonVoid(justUnder)).toHaveLength(CURVE_UNLOCK_N - 1);
    expect(boldness(justUnder)).toBeNull();
  });

  it("unlocks at exactly the threshold", () => {
    const atThreshold = Array.from({ length: CURVE_UNLOCK_N }, (_, i) => p(0.7, i % 2 === 0));
    expect(boldness(atThreshold)).not.toBeNull();
  });

  it("guards the division: all-YES past the gate → null, never Infinity/NaN", () => {
    // b̄ = 1 ⇒ uncertainty = 0 ⇒ resolution/uncertainty would be 0/0 = NaN.
    const allYes = Array.from({ length: CURVE_UNLOCK_N }, () => p(0.8, true));
    expect(boldness(allYes)).toBeNull();
  });

  it("guards the division: all-NO past the gate → null", () => {
    const allNo = Array.from({ length: CURVE_UNLOCK_N }, () => p(0.8, false));
    expect(boldness(allNo)).toBeNull();
  });

  it("a 50%-hugging hedger past the gate scores ~0 (resolution = 0)", () => {
    // 30 predictions all in one bucket, 15 YES / 15 NO: uncertainty = 0.25 > 0,
    // resolution = 0 ⇒ boldness = 0. The anti-hedging counterweight in action.
    const hedger = Array.from({ length: 30 }, (_, i) => p(0.7, i < 15));
    expect(boldness(hedger)).toBe(0);
  });

  it("returns null when there is nothing resolved", () => {
    expect(boldness([])).toBeNull();
  });
});

// Sanity: the fixtures are what the comments claim (single confidence per bucket).
describe("fixture integrity", () => {
  it("FIXTURE_12 has 12 resolved across single-valued buckets", () => {
    expect(resolvedNonVoid(FIXTURE_12)).toHaveLength(12);
    for (const b of calibrationBuckets(FIXTURE_12)) {
      // meanConfidence sits exactly on a decile center ⇒ one confidence per bucket.
      expect(b.meanConfidence).toBeCloseTo(b.center, 12);
    }
  });

  it("FIXTURE_40 has 40 resolved across single-valued buckets", () => {
    expect(resolvedNonVoid(FIXTURE_40)).toHaveLength(40);
    for (const b of calibrationBuckets(FIXTURE_40)) {
      expect(b.meanConfidence).toBeCloseTo(b.center, 12);
    }
  });

  it("per-prediction Brier still matches for a spot-checked row", () => {
    expect(brierScore(0.95, true)).toBeCloseTo(0.0025, 12);
  });
});
