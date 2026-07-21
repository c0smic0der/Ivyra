import { describe, expect, it } from "vitest";
import {
  BASELINE_BRIER,
  biasScore,
  biasSentence,
  brierScore,
  brierSentence,
  calibrationBuckets,
  ece,
  rollingBrier,
  runningBrier,
  type Scorable,
} from "@/lib/scoring";

// Test helper: build a Scorable tersely. Outcome is a boolean (YES/NO);
// `status` defaults to undefined (a non-null outcome ⇒ treated as resolved).
const p = (
  confidence: number,
  outcome: boolean | null,
  status?: Scorable["status"],
): Scorable => ({ confidence, outcome, status });

describe("brierScore (per-prediction)", () => {
  it("rewards a confident hit: (0.9, 1) = 0.01", () => {
    expect(brierScore(0.9, 1)).toBeCloseTo(0.01, 10);
  });

  it("punishes a confident miss: (0.9, 0) = 0.81", () => {
    expect(brierScore(0.9, 0)).toBeCloseTo(0.81, 10);
  });

  it("scores a coin-flip at 0.25 regardless of outcome", () => {
    expect(brierScore(0.5, 1)).toBeCloseTo(0.25, 10);
    expect(brierScore(0.5, 0)).toBeCloseTo(0.25, 10);
  });

  it("accepts boolean outcomes as well as 0/1", () => {
    expect(brierScore(0.9, true)).toBeCloseTo(0.01, 10);
    expect(brierScore(0.9, false)).toBeCloseTo(0.81, 10);
  });
});

describe("runningBrier", () => {
  it("averages per-prediction Briers [0.01, 0.36, 0.04] ≈ 0.1367", () => {
    // (0.9,YES)=0.01, (0.4,YES)=0.36, (0.8,YES)=0.04
    const preds = [p(0.9, true), p(0.4, true), p(0.8, true)];
    expect(runningBrier(preds)).toBeCloseTo(0.13667, 4);
  });

  it("returns the single prediction's Brier for a one-element set", () => {
    expect(runningBrier([p(0.9, true)])).toBeCloseTo(0.01, 10);
  });

  it("returns null on empty input", () => {
    expect(runningBrier([])).toBeNull();
  });

  it("returns null when every prediction is void/open (nothing resolved)", () => {
    expect(runningBrier([p(0.9, null, "void"), p(0.5, null, "open")])).toBeNull();
  });
});

describe("voids (and open predictions) excluded everywhere", () => {
  const resolved = [p(0.9, true), p(0.4, true), p(0.8, true)];
  // Same set, but with a void and a still-open prediction interleaved.
  const withNoise = [
    p(0.9, true),
    p(0.99, null, "void"),
    p(0.4, true),
    p(0.5, null, "open"),
    p(0.8, true),
  ];

  it("does not affect runningBrier", () => {
    expect(runningBrier(withNoise)).toBeCloseTo(runningBrier(resolved)!, 10);
  });

  it("does not affect biasScore", () => {
    expect(biasScore(withNoise)).toBeCloseTo(biasScore(resolved)!, 10);
  });

  it("does not affect ece", () => {
    expect(ece(withNoise)).toBeCloseTo(ece(resolved)!, 10);
  });

  it("does not affect calibrationBuckets", () => {
    expect(calibrationBuckets(withNoise)).toEqual(calibrationBuckets(resolved));
  });

  it("a status:void row is excluded even when it carries an outcome", () => {
    // Defensive: void wins over a stray outcome value.
    const withVoidedOutcome = [p(0.9, true), p(0.0, true, "void")];
    expect(runningBrier(withVoidedOutcome)).toBeCloseTo(0.01, 10);
  });
});

describe("empty input → null", () => {
  it("runningBrier / rollingBrier / biasScore / ece all return null", () => {
    expect(runningBrier([])).toBeNull();
    expect(rollingBrier([])).toBeNull();
    expect(biasScore([])).toBeNull();
    expect(ece([])).toBeNull();
  });

  it("calibrationBuckets returns an empty array", () => {
    expect(calibrationBuckets([])).toEqual([]);
  });
});

describe("rollingBrier (window = 20)", () => {
  it("with fewer than 20 resolutions, averages all present (equals runningBrier)", () => {
    const preds = [p(0.9, true), p(0.4, true), p(0.8, true)];
    expect(rollingBrier(preds)).toBeCloseTo(runningBrier(preds)!, 10);
    expect(rollingBrier(preds)).toBeCloseTo(0.13667, 4);
  });

  it("with more than 20, only the last 20 count (oldest ignored)", () => {
    // 5 oldest: worst-possible Brier of 1.0 each (conf 0 but YES).
    const oldest = Array.from({ length: 5 }, () => p(0.0, true));
    // 20 newest: perfect Brier of 0.0 each (conf 1 and YES).
    const newest = Array.from({ length: 20 }, () => p(1.0, true));
    const preds = [...oldest, ...newest];

    expect(rollingBrier(preds, 20)).toBeCloseTo(0.0, 10); // last 20 only
    expect(runningBrier(preds)).toBeCloseTo(0.2, 10); // all 25: (5*1)/25
  });

  it("returns null on empty input", () => {
    expect(rollingBrier([])).toBeNull();
  });
});

describe("biasScore (mean confidence − hit rate)", () => {
  it("is positive when overconfident", () => {
    // mean conf 0.9, hit rate 0.5 → +0.4
    expect(biasScore([p(0.9, true), p(0.9, false)])).toBeCloseTo(0.4, 10);
  });

  it("is negative when underconfident", () => {
    // mean conf 0.6, hit rate 1.0 → −0.4
    expect(biasScore([p(0.6, true), p(0.6, true)])).toBeCloseTo(-0.4, 10);
  });

  it("returns null on empty input", () => {
    expect(biasScore([])).toBeNull();
  });
});

describe("calibrationBuckets (deciles, half-open [lo, hi))", () => {
  it("confidence exactly 0.70 lands in index 7 deterministically", () => {
    const [bucket] = calibrationBuckets([p(0.7, true)]);
    expect(bucket.index).toBe(7);
    expect(bucket.low).toBeCloseTo(0.7, 10);
    expect(bucket.high).toBeCloseTo(0.8, 10);
  });

  it("a boundary value (0.80) lands in the higher bucket, index 8", () => {
    expect(calibrationBuckets([p(0.8, true)])[0].index).toBe(8);
  });

  it("confidence 1.0 lands in the closed top bucket, index 9", () => {
    expect(calibrationBuckets([p(1.0, true)])[0].index).toBe(9);
  });

  it("computes n, meanConfidence and actualFrequency per populated bucket", () => {
    // Bucket 7: four 0.75s, two YES → mean 0.75, freq 0.5, n 4
    // Bucket 9: one 0.95 YES → mean 0.95, freq 1.0, n 1
    const preds = [
      p(0.75, true),
      p(0.75, true),
      p(0.75, false),
      p(0.75, false),
      p(0.95, true),
    ];
    const buckets = calibrationBuckets(preds);
    expect(buckets).toHaveLength(2); // only populated buckets returned

    const b7 = buckets.find((b) => b.index === 7)!;
    expect(b7.n).toBe(4);
    expect(b7.meanConfidence).toBeCloseTo(0.75, 10);
    expect(b7.actualFrequency).toBeCloseTo(0.5, 10);

    const b9 = buckets.find((b) => b.index === 9)!;
    expect(b9.n).toBe(1);
    expect(b9.meanConfidence).toBeCloseTo(0.95, 10);
    expect(b9.actualFrequency).toBeCloseTo(1.0, 10);
  });

  it("single prediction → one bucket with actualFrequency ∈ {0,1}", () => {
    expect(calibrationBuckets([p(0.85, true)])[0].actualFrequency).toBe(1);
    expect(calibrationBuckets([p(0.85, false)])[0].actualFrequency).toBe(0);
  });
});

describe("ece (weighted average of |meanConfidence − actualFrequency|)", () => {
  it("weights buckets by size, not a simple average of gaps", () => {
    // Bucket 7: n=4, gap |0.75 − 0.5| = 0.25
    // Bucket 9: n=1, gap |0.95 − 1.0| = 0.05
    // weighted = 0.8*0.25 + 0.2*0.05 = 0.21  (simple avg would be 0.15)
    const preds = [
      p(0.75, true),
      p(0.75, true),
      p(0.75, false),
      p(0.75, false),
      p(0.95, true),
    ];
    expect(ece(preds)).toBeCloseTo(0.21, 10);
  });

  it("single prediction → the bucket's raw gap", () => {
    // |0.85 − 1| = 0.15
    expect(ece([p(0.85, true)])).toBeCloseTo(0.15, 10);
  });

  it("returns null on empty input", () => {
    expect(ece([])).toBeNull();
  });
});

describe("directional sentences (deterministic, no AI)", () => {
  it("BASELINE_BRIER is the always-50% constant", () => {
    expect(BASELINE_BRIER).toBe(0.25);
  });

  it("brierSentence flags a score worse than baseline as subtracting information", () => {
    expect(brierSentence(0.35)).toMatch(/subtracting information/i);
  });

  it("brierSentence credits a score better than baseline", () => {
    expect(brierSentence(0.15)).toMatch(/adding information/i);
  });

  it("brierSentence treats ≈0.25 as no better than a coin flip", () => {
    expect(brierSentence(0.25)).toMatch(/no better/i);
  });

  it("biasSentence names overconfidence in points", () => {
    const s = biasSentence(0.17);
    expect(s).toMatch(/17 points/);
    expect(s).toMatch(/overconfident/i);
  });

  it("biasSentence names underconfidence in points", () => {
    const s = biasSentence(-0.09);
    expect(s).toMatch(/9 points/);
    expect(s).toMatch(/underconfident/i);
  });

  it("biasSentence reports near-zero bias as well calibrated", () => {
    expect(biasSentence(0.01)).toMatch(/well calibrated/i);
  });
});
