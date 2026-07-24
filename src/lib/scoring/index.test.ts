import { describe, expect, it } from "vitest";
import {
  BASELINE_BRIER,
  BIAS_UNLOCK_N,
  biasByGroup,
  biasScore,
  biasSentence,
  boldnessSentence,
  brierScore,
  brierSentence,
  calibrationBuckets,
  CURVE_UNLOCK_N,
  ece,
  EWMA_ALPHA,
  ewmaBrierTrend,
  PROGRESS_UNLOCK_N,
  rollingBrier,
  rollingBrierTrend,
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

  it("boldnessSentence calls a near-zero value hedging", () => {
    // A 50%-hugger: confidence barely separates outcomes.
    expect(boldnessSentence(0.02)).toMatch(/hedging/i);
  });

  it("boldnessSentence calls a mid value partial signal that hugs the middle", () => {
    const s = boldnessSentence(0.3);
    expect(s).toMatch(/some signal/i);
    expect(s).toMatch(/hugs the middle/i);
  });

  it("boldnessSentence credits a healthy value as carrying real information", () => {
    expect(boldnessSentence(0.7)).toMatch(/real information/i);
  });

  it("boldnessSentence never leaks decomposition jargon into the UI", () => {
    // The three bands are the only user-facing copy for this stat; none of them
    // may say Murphy / resolution / uncertainty (docs §4.7 UI constraint).
    for (const v of [0.02, 0.3, 0.7]) {
      expect(boldnessSentence(v)).not.toMatch(/murphy|resolution|uncertainty/i);
    }
  });
});

describe("insights unlock thresholds", () => {
  it("BIAS_UNLOCK_N / CURVE_UNLOCK_N / PROGRESS_UNLOCK_N are the documented constants", () => {
    expect(BIAS_UNLOCK_N).toBe(10);
    expect(CURVE_UNLOCK_N).toBe(30);
    expect(PROGRESS_UNLOCK_N).toBe(25);
  });
});

describe("biasByGroup", () => {
  interface Grouped extends Scorable {
    category: string | null;
  }
  const g = (confidence: number, outcome: boolean | null, category: string | null, status?: Scorable["status"]): Grouped => ({
    confidence,
    outcome,
    status,
    category,
  });
  const byCategory = (preds: Grouped[]) => biasByGroup(preds, (pred) => pred.category);

  it("groups correctly by key", () => {
    const preds = [
      g(0.9, true, "work"),
      g(0.9, false, "work"),
      g(0.6, true, "health"),
      g(0.6, true, "health"),
    ];
    const rows = byCategory(preds);
    expect(rows).toHaveLength(2);
    const work = rows.find((r) => r.key === "work")!;
    expect(work.n).toBe(2);
    expect(work.bias).toBeCloseTo(0.4, 10); // mean conf 0.9, hit rate 0.5

    const health = rows.find((r) => r.key === "health")!;
    expect(health.n).toBe(2);
    expect(health.bias).toBeCloseTo(-0.4, 10); // mean conf 0.6, hit rate 1.0
  });

  it("excludes predictions with a null key", () => {
    const preds = [g(0.9, true, "work"), g(0.5, true, null)];
    const rows = byCategory(preds);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe("work");
  });

  it("drops a group whose members are all open/void (n=0, bias null)", () => {
    const preds = [g(0.9, null, "work", "open"), g(0.5, null, "work", "void")];
    expect(byCategory(preds)).toEqual([]);
  });

  it("n counts resolved-non-void members only, not raw group size", () => {
    // 3-row "work" group: 1 open, 1 void, 1 resolved.
    const preds = [g(0.9, null, "work", "open"), g(0.5, null, "work", "void"), g(0.7, true, "work")];
    const rows = byCategory(preds);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.n).toBe(1);
    expect(rows[0]!.bias).toBeCloseTo(0.7 - 1, 10);
  });

  it("sorts by n descending", () => {
    const preds = [
      g(0.9, true, "small"),
      g(0.9, true, "big"),
      g(0.9, true, "big"),
      g(0.9, true, "big"),
    ];
    const rows = byCategory(preds);
    expect(rows.map((r) => r.key)).toEqual(["big", "small"]);
  });

  it("returns [] on empty input", () => {
    expect(byCategory([])).toEqual([]);
  });
});

describe("rollingBrierTrend (window = 20)", () => {
  const p = (confidence: number, outcome: boolean | null, status?: Scorable["status"]): Scorable => ({
    confidence,
    outcome,
    status,
  });

  it("equals rollingBrier of each chronological prefix", () => {
    const preds = [p(0.9, true), p(0.4, true), p(0.8, true)];
    const trend = rollingBrierTrend(preds, 20);
    expect(trend).toEqual([
      { n: 1, value: rollingBrier([preds[0]!], 20) },
      { n: 2, value: rollingBrier([preds[0]!, preds[1]!], 20) },
      { n: 3, value: rollingBrier(preds, 20) },
    ]);
  });

  it("with a small window, later points reflect only the trailing window", () => {
    // 4 resolved: window=2 means the 4th point averages only preds[2..3].
    const preds = [p(0.0, true), p(0.0, true), p(1.0, true), p(1.0, true)];
    const trend = rollingBrierTrend(preds, 2);
    expect(trend[3]!.value).toBeCloseTo(0.0, 10); // last two are perfect (conf 1, YES)
    expect(trend[3]!.n).toBe(4);
  });

  it("a void/open interleaved is skipped and doesn't consume an n slot", () => {
    const preds = [p(0.9, true), p(0.99, null, "void"), p(0.4, true), p(0.5, null, "open"), p(0.8, true)];
    const trend = rollingBrierTrend(preds, 20);
    expect(trend.map((pt) => pt.n)).toEqual([1, 2, 3]);
  });

  it("length equals resolvedNonVoid(preds).length", () => {
    const preds = [p(0.9, true), p(0.99, null, "void"), p(0.4, true)];
    expect(rollingBrierTrend(preds, 20)).toHaveLength(2);
  });

  it("returns [] on empty input", () => {
    expect(rollingBrierTrend([], 20)).toEqual([]);
  });

  it("a single resolved prediction yields one point equal to its own Brier", () => {
    const trend = rollingBrierTrend([p(0.9, true)], 20);
    expect(trend).toEqual([{ n: 1, value: brierScore(0.9, true) }]);
  });
});

describe("ewmaBrierTrend (recency-weighted 'recent form')", () => {
  it("seeds the first point with that prediction's own Brier", () => {
    expect(ewmaBrierTrend([p(0.9, true)])).toEqual([{ n: 1, value: brierScore(0.9, true) }]);
  });

  it("applies the recurrence α·brier + (1−α)·prev at each step", () => {
    const preds = [p(0.9, true), p(0.9, false), p(0.5, true)]; // briers 0.01, 0.81, 0.25
    const a = EWMA_ALPHA;
    const b = [brierScore(0.9, true), brierScore(0.9, false), brierScore(0.5, true)];
    const e1 = b[0]!;
    const e2 = a * b[1]! + (1 - a) * e1;
    const e3 = a * b[2]! + (1 - a) * e2;
    const trend = ewmaBrierTrend(preds);
    expect(trend.map((t) => t.value)).toEqual([e1, e2, e3]);
    expect(trend.map((t) => t.n)).toEqual([1, 2, 3]);
  });

  it("excludes voids and open predictions, like every other aggregate", () => {
    const trend = ewmaBrierTrend([p(0.9, true), p(0.5, null, "void"), p(0.8, false, "open")]);
    expect(trend).toHaveLength(1);
  });

  it("tracks recent form: departs from the cumulative mean and ends far below a miss-heavy lifetime", () => {
    // Ten confident misses, then twenty confident hits.
    const preds = Array.from({ length: 30 }, (_, i) => p(0.9, i >= 10));
    const ewma = ewmaBrierTrend(preds);
    let sum = 0;
    let departures = 0;
    ewma.forEach((pt, i) => {
      sum += brierScore(preds[i]!.confidence, preds[i]!.outcome as boolean);
      if (Math.abs(pt.value - sum / (i + 1)) > 1e-9) departures++;
    });
    // Once the hits start arriving, recent form pulls away from the lifetime mean.
    expect(departures).toBeGreaterThan(15);
    // Recent form (all recent hits) ends far below the miss-laden lifetime mean.
    expect(ewma.at(-1)!.value).toBeLessThan(0.05);
    expect(sum / preds.length).toBeGreaterThan(0.25);
  });

  it("higher alpha reacts faster to a fresh result", () => {
    const preds = [p(0.5, true), p(0.5, true), p(0.9, false)]; // calm, then a big miss
    const slow = ewmaBrierTrend(preds, 0.1).at(-1)!.value;
    const fast = ewmaBrierTrend(preds, 0.5).at(-1)!.value;
    expect(fast).toBeGreaterThan(slow); // fast weights the recent miss more
  });
});
