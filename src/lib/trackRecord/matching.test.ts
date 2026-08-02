import { describe, expect, it } from "vitest";
import {
  bandFloor,
  bandTrackRecordSentence,
  baseRateFallbackSentence,
  MIN_MATCHES,
  selectBandTrackRecord,
  type SimilarMatch,
} from "@/lib/trackRecord/matching";

const m = (confidence: number, outcome: boolean): SimilarMatch => ({
  text: "placeholder",
  confidence,
  outcome,
  resolvedAt: "2026-01-01T00:00:00Z",
  similarity: 0.9, // already similarity-gated by query.ts; band logic ignores it
});

describe("bandFloor", () => {
  it("floors a percent to the nearest 5-point step", () => {
    expect(bandFloor(82)).toBe(80);
    expect(bandFloor(75)).toBe(75);
    expect(bandFloor(89)).toBe(85);
    expect(bandFloor(50)).toBe(50);
  });
});

describe("selectBandTrackRecord — band tracks the slider", () => {
  // Similar calls at 90, 85, 80, 78, 76, 72 (%).
  const matches = [m(0.9, false), m(0.85, true), m(0.8, false), m(0.78, false), m(0.76, false), m(0.72, true)];

  it("uses the current confidence band when it has ≥ MIN_MATCHES", () => {
    // At 80: calls ≥80% are 90,85,80 → n=3, landed = 1 (the 85 hit).
    const band = selectBandTrackRecord(matches, 80);
    expect(band).toEqual({ bandPercent: 80, count: 3, landed: 1 });
  });

  it("moves the band with the slider — a higher confidence reports a higher band", () => {
    // At 85: ≥85% are 90,85 → n=2 (< 3), so widen DOWN to the highest band with
    // n≥3. 80 gives 90,85,80 → n=3. So band = 80, not 85, and not the set floor 70.
    const band = selectBandTrackRecord(matches, 85);
    expect(band?.bandPercent).toBe(80);
    expect(band?.count).toBe(3);
  });

  it("a floored slider value never reports the raw percent (82 → 80)", () => {
    const band = selectBandTrackRecord(matches, 82);
    expect(band?.bandPercent).toBe(80);
  });
});

describe("selectBandTrackRecord — widening picks the HIGHEST qualifying band, not the floor", () => {
  it("widens down only as far as needed to clear MIN_MATCHES", () => {
    // Calls at 95, 92, 60, 55, 50. Start high (99) → 95:1, 90:2, ... 60:3.
    const matches = [m(0.95, true), m(0.92, false), m(0.6, false), m(0.55, false), m(0.5, false)];
    const band = selectBandTrackRecord(matches, 99);
    // Highest band with n≥3 is 60 (95,92,60), NOT the set floor 50.
    expect(band?.bandPercent).toBe(60);
    expect(band?.count).toBe(3);
    expect(band?.landed).toBe(1); // only the 95 landed
  });

  it("never widens ABOVE the current confidence band", () => {
    // Plenty of calls, but the slider is low. Band must not exceed the slider band.
    const matches = [m(0.9, true), m(0.9, true), m(0.9, true), m(0.9, true)];
    const band = selectBandTrackRecord(matches, 60);
    expect(band?.bandPercent).toBe(60); // reported at the slider band, though all are 90%
    expect(band?.count).toBe(4);
  });
});

describe("selectBandTrackRecord — the MIN_MATCHES gate / static fallback", () => {
  it("returns null when no band down to the floor reaches MIN_MATCHES", () => {
    const matches = [m(0.8, true), m(0.75, false)]; // only 2 similar calls total
    expect(matches.length).toBeLessThan(MIN_MATCHES);
    expect(selectBandTrackRecord(matches, 80)).toBeNull();
  });

  it("returns null for an empty match set", () => {
    expect(selectBandTrackRecord([], 80)).toBeNull();
  });

  it("is satisfied by exactly MIN_MATCHES at the band", () => {
    const matches = [m(0.8, true), m(0.8, false), m(0.8, true)];
    expect(selectBandTrackRecord(matches, 80)).toEqual({ bandPercent: 80, count: 3, landed: 2 });
  });

  it("counts a call exactly at the band as 'or higher'", () => {
    const matches = [m(0.75, true), m(0.75, false), m(0.75, false)];
    const band = selectBandTrackRecord(matches, 75);
    expect(band?.bandPercent).toBe(75);
    expect(band?.count).toBe(3);
  });
});

describe("bandTrackRecordSentence — states a frequency and stops", () => {
  it("matches the §3.3 copy exactly", () => {
    expect(bandTrackRecordSentence({ bandPercent: 75, count: 6, landed: 2 })).toBe(
      "You've said 75% or higher on 6 calls like this. 2 landed.",
    );
  });

  it("uses the singular 'call' when count is 1", () => {
    expect(bandTrackRecordSentence({ bandPercent: 90, count: 1, landed: 0 })).toBe(
      "You've said 90% or higher on 1 call like this. 0 landed.",
    );
  });

  it("never advises or evaluates — no merit language", () => {
    const sentence = bandTrackRecordSentence({ bandPercent: 80, count: 4, landed: 1 });
    for (const banned of ["should", "consider", "good", "bad", "wrong", "better", "lower"]) {
      expect(sentence.toLowerCase()).not.toContain(banned);
    }
  });
});

describe("baseRateFallbackSentence — plainly general, not personal", () => {
  it("names it as a general outside view, states a frequency, stops", () => {
    const sentence = baseRateFallbackSentence(35);
    expect(sentence).toContain("35%");
    expect(sentence.toLowerCase()).toContain("in general");
    // Must not imply it's the user's own record.
    expect(sentence.toLowerCase()).not.toContain("you've said");
  });
});
