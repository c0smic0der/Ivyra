import { describe, expect, it } from "vitest";

// Trivial test to prove the Vitest harness runs. Real scoring tests
// (Brier, buckets, ECE, rolling) land alongside the scoring functions in v1.
describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
