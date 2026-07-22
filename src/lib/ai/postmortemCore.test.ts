import { describe, expect, it } from "vitest";
import { buildPostmortemPrompt, isMiss, type PostmortemInputs } from "./postmortemCore";

describe("isMiss — a miss is the wrong side of the 0.25 baseline", () => {
  it("is a miss when confident and wrong", () => {
    expect(isMiss(0.9, false)).toBe(true); // brier 0.81
    expect(isMiss(0.8, false)).toBe(true); // brier 0.64
  });

  it("is not a miss when confident and right", () => {
    expect(isMiss(0.9, true)).toBe(false); // brier 0.01
  });

  it("a 50/50 call is never a miss (brier exactly 0.25, not worse)", () => {
    expect(isMiss(0.5, true)).toBe(false);
    expect(isMiss(0.5, false)).toBe(false);
  });

  it("a low-confidence YES that happened is a miss (under-confident wrong side)", () => {
    expect(isMiss(0.2, true)).toBe(true); // brier 0.64
  });
});

describe("buildPostmortemPrompt — anchors only to user-written text", () => {
  const base: PostmortemInputs = {
    predictionText: "The kitchen reno finishes by Aug 15",
    reasoning: "The contractor promised it and has been reliable",
    planOrDisconfirm: "If the permit is denied I'd drop confidence",
    predictionKind: "world",
    confidencePercent: 85,
    outcome: false,
    outcomeNote: "Permit came back two weeks late",
    similarMisses: [],
  };

  it("includes every user field verbatim", () => {
    const prompt = buildPostmortemPrompt(base);
    expect(prompt).toContain(base.predictionText);
    expect(prompt).toContain(base.reasoning);
    expect(prompt).toContain(base.planOrDisconfirm!);
    expect(prompt).toContain("85%");
    expect(prompt).toContain(base.outcomeNote!);
    expect(prompt).toContain("NO — it did not happen");
  });

  it("labels the second field by prediction kind", () => {
    expect(buildPostmortemPrompt(base)).toContain("What would change their mind:");
    const selfKind = buildPostmortemPrompt({ ...base, predictionKind: "self" });
    expect(selfKind).toContain("Their plan:");
  });

  it("omits optional fields cleanly when absent", () => {
    const prompt = buildPostmortemPrompt({ ...base, planOrDisconfirm: null, outcomeNote: null });
    expect(prompt).not.toContain("What would change their mind");
    expect(prompt).not.toContain("note on what happened");
  });

  it("lists similar past misses when provided", () => {
    const prompt = buildPostmortemPrompt({
      ...base,
      similarMisses: [
        { text: "The deck project finishes on time", confidencePercent: 80, outcome: false },
      ],
    });
    expect(prompt).toContain("similar past misses");
    expect(prompt).toContain("The deck project finishes on time");
    expect(prompt).toContain("80% confident");
  });
});
