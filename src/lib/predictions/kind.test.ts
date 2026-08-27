import { describe, expect, it } from "vitest";

import { kindFor } from "./kind";

// kindFor centralizes how prediction_kind is derived at write time. The rule:
// a *decision* entry is always about the user's own action, so any non-null
// `decision` forces kind 'self'; otherwise the stored self/world choice stands.
// prediction_kind must never be set inline — every write path routes through this.
describe("kindFor", () => {
  it("returns 'self' when a decision is present, regardless of the stored kind", () => {
    expect(kindFor({ decision: "turned down the contract", predictionKind: "world" })).toBe("self");
    expect(kindFor({ decision: "turned down the contract", predictionKind: "self" })).toBe("self");
    // Even an empty-string decision is non-null → a decision entry.
    expect(kindFor({ decision: "", predictionKind: "world" })).toBe("self");
  });

  it("falls through to the stored kind for a forecast (no decision)", () => {
    expect(kindFor({ decision: null, predictionKind: "self" })).toBe("self");
    expect(kindFor({ decision: null, predictionKind: "world" })).toBe("world");
  });

  it("treats an undefined decision as absent (loose null check)", () => {
    expect(kindFor({ predictionKind: "world" })).toBe("world");
    expect(kindFor({ decision: undefined, predictionKind: "self" })).toBe("self");
  });

  it("throws on the malformed case: no decision and an invalid stored kind", () => {
    expect(() => kindFor({ decision: null, predictionKind: "banana" })).toThrow();
    expect(() => kindFor({ predictionKind: "" })).toThrow();
  });
});
