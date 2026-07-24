import { describe, expect, it } from "vitest";
import { enrichReasoningTypeValues } from "@/lib/ai/enrichSchema";
import { ALL_HOW_IT_WORKS_COPY, BOLDNESS_COPY } from "./howItWorks";

// Extends the no-jargon discipline of scopedInsightView.test.ts to the whole
// /how-it-works page. The page must be readable by someone who knows nothing
// about calibration, so two classes of token are banned:

// (1) Everywhere on the page — the internal reasoning-type taxonomy (internal
//     only, must never surface) and hard technical jargon the page avoids by
//     design. Substrings are chosen so they can't false-positive on ordinary
//     words the page legitimately uses (e.g. we ban "expected calibration error",
//     never a bare "ece", which hides inside "recent").
const GLOBAL_FORBIDDEN = [
  ...enrichReasoningTypeValues, // base_rate, gut_feel, …
  ...enrichReasoningTypeValues.map((v) => v.replace(/_/g, " ")), // "base rate", "gut feel", …
  "murphy",
  "decomposition",
  "sharpness",
  "discrimination",
  "reliability",
  "expected calibration error",
  "wilson",
  "logarithmic",
  "log score",
  "skill score",
];

// (2) Inside the boldness explanation only — words that are fine elsewhere on the
//     page ("resolution date", judgment "under uncertainty") but that the spec
//     forbids in this particular explanation.
const BOLDNESS_FORBIDDEN = ["murphy", "resolution", "uncertainty"];

describe("how-it-works copy — no jargon", () => {
  it("uses no internal taxonomy value or hard jargon anywhere on the page", () => {
    const joined = ALL_HOW_IT_WORKS_COPY.join(" | ").toLowerCase();
    for (const token of GLOBAL_FORBIDDEN) {
      expect(joined, `forbidden token "${token}" reached the page copy`).not.toContain(token.toLowerCase());
    }
  });

  it("keeps the boldness explanation free of the flagged words", () => {
    const joined = BOLDNESS_COPY.join(" | ").toLowerCase();
    for (const token of BOLDNESS_FORBIDDEN) {
      expect(joined, `"${token}" must not appear in the boldness explanation`).not.toContain(token);
    }
  });

  it("actually explains boldness (guards against an accidentally empty section)", () => {
    expect(ALL_HOW_IT_WORKS_COPY.length).toBeGreaterThan(20);
    expect(BOLDNESS_COPY.join(" ").toLowerCase()).toContain("boldness");
  });
});
