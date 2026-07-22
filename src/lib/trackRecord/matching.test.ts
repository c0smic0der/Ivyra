import { describe, expect, it } from "vitest";
import {
  computeTrackRecord,
  gateMatches,
  MIN_MATCHES,
  SIMILARITY_THRESHOLD,
  trackRecordSentence,
  type SimilarMatch,
} from "@/lib/trackRecord/matching";

const m = (similarity: number, confidence: number, outcome: boolean): SimilarMatch => ({
  text: "placeholder",
  confidence,
  outcome,
  resolvedAt: "2026-01-01T00:00:00Z",
  similarity,
});

describe("gateMatches — similarity-threshold gating", () => {
  it("passes through matches at/above the threshold when there are enough of them", () => {
    const matches = [m(0.9, 0.7, true), m(0.8, 0.6, false), m(0.75, 0.5, true)];
    expect(gateMatches(matches)).toEqual(matches);
  });

  it("excludes matches below the threshold before counting", () => {
    const matches = [
      m(0.9, 0.7, true),
      m(0.8, 0.6, false),
      m(0.76, 0.4, true),
      m(0.74, 0.5, true),
      m(0.6, 0.9, true),
    ];
    const gated = gateMatches(matches);
    expect(gated).toHaveLength(3);
    expect(gated?.every((mm) => mm.similarity >= SIMILARITY_THRESHOLD)).toBe(true);
  });

  it("returns null when fewer than MIN_MATCHES clear the threshold", () => {
    const matches = [m(0.9, 0.7, true), m(0.8, 0.6, false)];
    expect(matches.length).toBeLessThan(MIN_MATCHES);
    expect(gateMatches(matches)).toBeNull();
  });

  it("returns null for an empty match set", () => {
    expect(gateMatches([])).toBeNull();
  });

  it("is satisfied by exactly MIN_MATCHES at exactly the threshold (boundary case)", () => {
    const matches = [m(0.75, 0.5, true), m(0.75, 0.5, false), m(0.75, 0.5, true)];
    expect(gateMatches(matches)).toHaveLength(3);
  });

  it("respects custom threshold/minMatches", () => {
    const matches = [m(0.5, 0.5, true), m(0.5, 0.5, true)];
    expect(gateMatches(matches, 0.4, 2)).toHaveLength(2);
    expect(gateMatches(matches, 0.4, 3)).toBeNull();
  });
});

describe("computeTrackRecord — hit-rate computation", () => {
  it("averages confidence and hit rate over the match set", () => {
    // confidences [0.8, 0.7, 0.9] -> avg 0.8; outcomes [true,false,true] -> 2/3
    const matches = [m(0.9, 0.8, true), m(0.85, 0.7, false), m(0.8, 0.9, true)];
    const stats = computeTrackRecord(matches);
    expect(stats.count).toBe(3);
    expect(stats.avgConfidence).toBeCloseTo(0.8, 10);
    expect(stats.hitRate).toBeCloseTo(2 / 3, 10);
  });

  it("gives hitRate 0 when nothing came true", () => {
    const matches = [m(0.9, 0.6, false), m(0.9, 0.6, false), m(0.9, 0.6, false)];
    expect(computeTrackRecord(matches).hitRate).toBe(0);
  });

  it("gives hitRate 1 when everything came true", () => {
    const matches = [m(0.9, 0.6, true), m(0.9, 0.6, true), m(0.9, 0.6, true)];
    expect(computeTrackRecord(matches).hitRate).toBe(1);
  });
});

describe("trackRecordSentence — templated phrasing", () => {
  it("renders the count, rounded avg confidence, and rounded hit rate", () => {
    const sentence = trackRecordSentence({ count: 6, avgConfidence: 0.82, hitRate: 1 / 3 });
    expect(sentence).toBe("You've made 6 similar predictions. Avg confidence 82%. 33% came true.");
  });
});
