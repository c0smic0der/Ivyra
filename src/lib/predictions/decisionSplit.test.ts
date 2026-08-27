import { describe, expect, it } from "vitest";

import { deriveDecisionAndText } from "./decisionSplit";

// The capture-time rule (docs/06-decision-layer.md §2.1): identical fields collapse to
// a pure forecast (decision null); differing fields split into decision + text (the
// scoreable claim). This is the ONLY place that split happens — actions.ts calls it
// rather than reimplementing the comparison inline.
describe("deriveDecisionAndText", () => {
  it("collapses identical fields to a pure forecast with decision null", () => {
    expect(deriveDecisionAndText("The kitchen reno finishes by Aug 15", "The kitchen reno finishes by Aug 15")).toEqual(
      { decision: null, text: "The kitchen reno finishes by Aug 15" },
    );
  });

  it("splits differing fields into decision and text", () => {
    expect(deriveDecisionAndText("I turn down the contract", "They come back with a better offer by Friday")).toEqual(
      { decision: "I turn down the contract", text: "They come back with a better offer by Friday" },
    );
  });

  it("is case- and whitespace-sensitive (callers are expected to pass already-trimmed strings)", () => {
    expect(deriveDecisionAndText("Same text", "same text")).toEqual({
      decision: "Same text",
      text: "same text",
    });
    expect(deriveDecisionAndText("Same text", "Same text ")).toEqual({
      decision: "Same text",
      text: "Same text ",
    });
  });
});
