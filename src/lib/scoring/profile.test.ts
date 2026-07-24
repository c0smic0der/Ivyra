import { describe, expect, it } from "vitest";
import {
  calibrationByGroup,
  classifyProfile,
  PROFILE_BOLDNESS_MIN,
  PROFILE_RELIABILITY_HIGH,
  PROFILE_UNLOCK_N,
  ROLLING_WINDOW,
  type Scorable,
} from "./index";

// A resolved, non-void prediction with an optional group key.
function p(confidence: number, outcome: boolean, key?: string | null): Scorable & { g: string | null } {
  return { confidence, outcome, status: "resolved", g: key ?? null };
}

describe("classifyProfile", () => {
  // Each branch is driven from a plain stats object, so a branch is exercised by
  // the exact (reliability, boldness) it turns on — no need to reverse-engineer
  // predictions that land on a given reliability.

  it("returns insufficient_data below the sample floor", () => {
    expect(
      classifyProfile({ n: PROFILE_UNLOCK_N - 1, reliability: 0.0, boldness: 0.9 }),
    ).toBe("insufficient_data");
  });

  it("returns insufficient_data when reliability can't be read (nothing resolved)", () => {
    expect(classifyProfile({ n: 20, reliability: null, boldness: 0.5 })).toBe("insufficient_data");
  });

  it("returns insufficient_data when boldness can't be read (no outcome variety)", () => {
    // Enough data and perfect reliability, but every outcome came out the same
    // way (uncertainty 0), so boldness is null — nothing to sort, no verdict.
    expect(classifyProfile({ n: 40, reliability: 0.0, boldness: null })).toBe("insufficient_data");
  });

  it("classifies high reliability as miscalibrated, regardless of boldness", () => {
    // Bold AND miscalibrated still resolves to miscalibrated — the correction is
    // "shift your high-confidence calls down", not "commit harder".
    expect(
      classifyProfile({ n: 30, reliability: PROFILE_RELIABILITY_HIGH, boldness: 0.9 }),
    ).toBe("miscalibrated");
    expect(
      classifyProfile({ n: 30, reliability: PROFILE_RELIABILITY_HIGH + 0.05, boldness: 0.02 }),
    ).toBe("miscalibrated");
  });

  it("classifies low reliability + low boldness as hedger", () => {
    expect(
      classifyProfile({
        n: 30,
        reliability: PROFILE_RELIABILITY_HIGH - 0.001,
        boldness: PROFILE_BOLDNESS_MIN - 0.001,
      }),
    ).toBe("hedger");
  });

  it("classifies low reliability + healthy boldness as calibrated_and_bold", () => {
    expect(
      classifyProfile({
        n: 30,
        reliability: PROFILE_RELIABILITY_HIGH - 0.001,
        boldness: PROFILE_BOLDNESS_MIN,
      }),
    ).toBe("calibrated_and_bold");
  });

  it("treats the reliability boundary as miscalibrated (>= is the cut)", () => {
    // At exactly the threshold the verdict is miscalibrated; a hair below it is not.
    expect(classifyProfile({ n: 30, reliability: PROFILE_RELIABILITY_HIGH, boldness: 0.9 })).toBe(
      "miscalibrated",
    );
    expect(
      classifyProfile({ n: 30, reliability: PROFILE_RELIABILITY_HIGH - 1e-9, boldness: 0.9 }),
    ).toBe("calibrated_and_bold");
  });

  it("is assignable at the Recent-scope window size (below CURVE_UNLOCK_N)", () => {
    // The profile must work over a ROLLING_WINDOW-sized recent slice — proof the
    // floor is the profile's own, not the curve's 30.
    expect(PROFILE_UNLOCK_N).toBeLessThanOrEqual(ROLLING_WINDOW);
    expect(classifyProfile({ n: ROLLING_WINDOW, reliability: 0.0, boldness: 0.6 })).toBe(
      "calibrated_and_bold",
    );
  });
});

describe("calibrationByGroup", () => {
  it("computes per-group n, mean confidence, hit rate, and bias", () => {
    const preds = [
      p(0.9, true, "work"),
      p(0.9, false, "work"), // work: mean conf 0.9, hit rate 0.5, bias +0.4
      p(0.6, true, "health"),
      p(0.4, true, "health"), // health: mean conf 0.5, hit rate 1.0, bias -0.5
    ];
    const rows = calibrationByGroup(preds, (x) => x.g);
    const work = rows.find((r) => r.key === "work")!;
    const health = rows.find((r) => r.key === "health")!;

    expect(work).toMatchObject({ n: 2, hits: 1, meanConfidence: 0.9, hitRate: 0.5 });
    expect(work.bias).toBeCloseTo(0.4, 10);
    expect(health).toMatchObject({ n: 2, hits: 2, hitRate: 1.0 });
    expect(health.meanConfidence).toBeCloseTo(0.5, 10);
    expect(health.bias).toBeCloseTo(-0.5, 10);
  });

  it("excludes null keys and drops groups with no resolved-non-void members", () => {
    const preds: Array<Scorable & { g: string | null }> = [
      p(0.8, true, "work"),
      p(0.7, false, null), // null key: not attributable, excluded
      { confidence: 0.5, outcome: null, status: "void", g: "money" }, // only member is void → dropped
      { confidence: 0.5, outcome: null, status: "open", g: "self" }, // only member is open → dropped
    ];
    const rows = calibrationByGroup(preds, (x) => x.g);
    expect(rows.map((r) => r.key)).toEqual(["work"]);
    expect(rows[0].n).toBe(1);
  });

  it("sorts by resolved count descending", () => {
    const preds = [
      p(0.8, true, "a"),
      p(0.8, true, "b"),
      p(0.8, true, "b"),
      p(0.8, true, "b"),
      p(0.8, true, "c"),
      p(0.8, true, "c"),
    ];
    expect(calibrationByGroup(preds, (x) => x.g).map((r) => r.key)).toEqual(["b", "c", "a"]);
  });

  it("returns an empty array when nothing is grouped", () => {
    expect(calibrationByGroup([], () => "x")).toEqual([]);
  });
});
