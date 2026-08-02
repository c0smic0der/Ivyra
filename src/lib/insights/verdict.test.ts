import { describe, expect, it } from "vitest";
import type { FrequencyGap } from "@/lib/scoring";
import { buildVerdict, frequencyGapHeadline, verdictToneLabel } from "./verdict";

const gap = (meanConfidence: number, actualFrequency: number, n = 30): FrequencyGap => ({
  meanConfidence,
  actualFrequency,
  n,
});

describe("frequencyGapHeadline", () => {
  it("states the gap in the user's own terms, rounded to whole percents", () => {
    expect(frequencyGapHeadline(gap(0.85, 0.38))).toBe("When you say 85%, it happens 38% of the time.");
  });

  it("rounds each figure independently", () => {
    expect(frequencyGapHeadline(gap(0.854, 0.376))).toBe("When you say 85%, it happens 38% of the time.");
    expect(frequencyGapHeadline(gap(0.705, 0.695))).toBe("When you say 71%, it happens 70% of the time.");
  });
});

describe("buildVerdict — the headline leads with the frequency gap", () => {
  it("overconfident: quotes the wide gap between stated confidence and frequency", () => {
    const v = buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0.47, gap: gap(0.85, 0.38) });
    expect(v.headline).toBe("When you say 85%, it happens 38% of the time.");
    expect(v.tone).toBe("caution");
    expect(v.sub).toBe("Your high-confidence calls come true less often than you claim.");
  });

  it("underconfident: same headline shape, the gap simply runs the other way", () => {
    const v = buildVerdict({ n: 30, profile: "miscalibrated", biasValue: -0.2, gap: gap(0.6, 0.8) });
    expect(v.headline).toBe("When you say 60%, it happens 80% of the time.");
    expect(v.tone).toBe("caution");
    expect(v.sub).toBe("Outcomes come true more often than your confidence suggests.");
  });

  it("well-calibrated (calibrated_and_bold): the two numbers nearly match", () => {
    const v = buildVerdict({ n: 34, profile: "calibrated_and_bold", biasValue: 0.01, gap: gap(0.71, 0.7) });
    expect(v.headline).toBe("When you say 71%, it happens 70% of the time.");
    expect(v.tone).toBe("positive");
  });

  it("hedging: still a frequency statement, numbers hug 50/50", () => {
    const v = buildVerdict({ n: 30, profile: "hedger", biasValue: 0.01, gap: gap(0.56, 0.55) });
    expect(v.headline).toBe("When you say 56%, it happens 55% of the time.");
    expect(v.tone).toBe("neutral");
  });

  it("centered/unknown-bias miscalibration still leads with the gap", () => {
    const centered = buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0, gap: gap(0.7, 0.62) });
    expect(centered.headline).toBe("When you say 70%, it happens 62% of the time.");
    expect(centered.sub).toBe("The gap between the confidence you state and how often it happens is still wide.");
  });
});

describe("buildVerdict — lock and forming states", () => {
  it("locks with zero resolutions (no gap to report)", () => {
    const v = buildVerdict({ n: 0, profile: "insufficient_data", biasValue: null, gap: null });
    expect(v.tone).toBe("locked");
    expect(v.headline).toBe("No resolutions yet");
  });

  it("is neutral while the picture is still forming, reporting the count", () => {
    const v = buildVerdict({ n: 6, profile: "insufficient_data", biasValue: null, gap: gap(0.8, 0.5, 6) });
    expect(v.tone).toBe("neutral");
    expect(v.headline).toBe("Your calibration picture is still forming");
    expect(v.sub).toContain("6 resolved");
  });

  it("stays total if a substantive profile ever arrives without a gap", () => {
    const v = buildVerdict({ n: 30, profile: "hedger", biasValue: 0.01, gap: null });
    expect(v.headline).toBe("Your calibration picture is still forming");
  });
});

describe("buildVerdict — copy rule: reports frequency, never evaluates a decision", () => {
  const cases = [
    buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0.47, gap: gap(0.85, 0.38) }),
    buildVerdict({ n: 30, profile: "miscalibrated", biasValue: -0.2, gap: gap(0.6, 0.8) }),
    buildVerdict({ n: 30, profile: "miscalibrated", biasValue: 0, gap: gap(0.7, 0.62) }),
    buildVerdict({ n: 34, profile: "calibrated_and_bold", biasValue: 0.01, gap: gap(0.71, 0.7) }),
    buildVerdict({ n: 30, profile: "hedger", biasValue: 0.01, gap: gap(0.56, 0.55) }),
    buildVerdict({ n: 6, profile: "insufficient_data", biasValue: null, gap: gap(0.8, 0.5, 6) }),
    buildVerdict({ n: 0, profile: "insufficient_data", biasValue: null, gap: null }),
  ];

  // The banned merit phrasings from the CLAUDE.md copy rule.
  const BANNED = [
    "good call",
    "bad call",
    "you were right",
    "you were wrong",
    "right to",
    "wrong to",
    "should have",
    "better decision",
    "poor judgment",
    "well done",
  ];

  it("no headline or sub uses merit language", () => {
    for (const v of cases) {
      const text = `${v.headline} ${v.sub ?? ""}`.toLowerCase();
      for (const banned of BANNED) {
        expect(text, `"${text}" contains "${banned}"`).not.toContain(banned);
      }
    }
  });

  it("no sub prescribes an action (that's the AI insight's job)", () => {
    for (const v of cases) {
      expect(v.sub ?? "").not.toMatch(/shift them down|commit harder|you can commit|consider|you should/i);
    }
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
