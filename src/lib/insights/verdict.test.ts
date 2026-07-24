import { describe, expect, it } from "vitest";
import { buildVerdict, verdictToneLabel } from "./verdict";

describe("buildVerdict", () => {
  it("locks with zero resolutions", () => {
    const v = buildVerdict({ n: 0, profile: "insufficient_data", biasValue: null });
    expect(v.tone).toBe("locked");
    expect(v.headline).toBe("No resolutions yet");
  });

  it("is neutral while the picture is still forming", () => {
    const v = buildVerdict({ n: 6, profile: "insufficient_data", biasValue: null });
    expect(v.tone).toBe("neutral");
    expect(v.sub).toContain("6 resolved");
  });

  it("celebrates calibrated_and_bold", () => {
    expect(buildVerdict({ n: 34, profile: "calibrated_and_bold", biasValue: 0.04 }).tone).toBe("positive");
  });

  it("reads a hedger as neutral, not a warning", () => {
    const v = buildVerdict({ n: 30, profile: "hedger", biasValue: 0.01 });
    expect(v.tone).toBe("neutral");
    expect(v.headline).toContain("hedge");
  });

  it("names the direction for a one-sided miscalibration", () => {
    expect(buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0.2 }).headline).toBe("You lean overconfident");
    expect(buildVerdict({ n: 30, profile: "miscalibrated", biasValue: -0.2 }).headline).toBe("You lean underconfident");
    expect(buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0.2 }).tone).toBe("caution");
  });

  it("falls back to a generic mismatch when the bias is centered or unknown", () => {
    expect(buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0 }).headline).toContain("don't line up");
    expect(buildVerdict({ n: 30, profile: "miscalibrated", biasValue: null }).headline).toContain("don't line up");
  });

  it("is descriptive only — no prescriptive clauses in any verdict sub", () => {
    const subs = [
      buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0.2 }).sub,
      buildVerdict({ n: 30, profile: "miscalibrated", biasValue: -0.2 }).sub,
      buildVerdict({ n: 30, profile: "hedger", biasValue: 0.01 }).sub,
      buildVerdict({ n: 34, profile: "calibrated_and_bold", biasValue: 0.04 }).sub,
    ];
    // No imperatives that tell the user what to DO — that's the AI insight's job.
    for (const sub of subs) {
      expect(sub).not.toMatch(/shift them down|commit harder|you can commit/i);
    }
    // The specific string the spec called out is gone.
    expect(buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0.2 }).sub).toBe(
      "Your high-confidence calls come true less often than you claim.",
    );
  });
});

describe("verdictToneLabel", () => {
  it("maps each tone to a neutral status word (no 'needs work')", () => {
    expect(verdictToneLabel("positive")).toBe("strong");
    expect(verdictToneLabel("caution")).toBe("mixed");
    expect(verdictToneLabel("neutral")).toBe("forming");
    expect(verdictToneLabel("locked")).toBe("locked");
  });
});
