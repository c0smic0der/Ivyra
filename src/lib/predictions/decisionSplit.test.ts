import { describe, expect, it } from "vitest";

import { deriveDecisionAndText } from "./decisionSplit";

// The capture-time rule (docs/06-decision-layer.md §2.1, decisions-only capture):
// the first above-the-fold field always persists to `decision`, the second — always
// the scoreable claim — to `text`. This is the ONLY place that assignment happens —
// actions.ts calls it rather than reimplementing the pairing inline.
describe("deriveDecisionAndText", () => {
  it("maps the first field to decision and the second to text, verbatim", () => {
    expect(deriveDecisionAndText("I turn down the contract", "They come back with a better offer by Friday")).toEqual(
      { decision: "I turn down the contract", text: "They come back with a better offer by Friday" },
    );
  });

  it("never produces a null decision — the return type has no null branch", () => {
    const result = deriveDecisionAndText("I move to Denver", "I sign a lease within 60 days");
    expect(result.decision).toBe("I move to Denver");
    expect(result.decision).not.toBeNull();
  });
});
