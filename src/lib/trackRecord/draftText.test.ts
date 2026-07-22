import { describe, expect, it } from "vitest";
import { boundDraftText, MAX_DRAFT_CHARS } from "@/lib/trackRecord/draftText";

describe("boundDraftText — max-length guard (boundary cases)", () => {
  it("leaves a short draft unchanged", () => {
    expect(boundDraftText("The kitchen reno finishes by Aug 15")).toBe(
      "The kitchen reno finishes by Aug 15",
    );
  });

  it("trims surrounding whitespace before measuring length", () => {
    expect(boundDraftText("  hello world  ")).toBe("hello world");
  });

  it("leaves a draft at exactly MAX_DRAFT_CHARS unchanged", () => {
    const atLimit = "a".repeat(MAX_DRAFT_CHARS);
    const bounded = boundDraftText(atLimit);
    expect(bounded).toBe(atLimit);
    expect(bounded.length).toBe(MAX_DRAFT_CHARS);
  });

  it("truncates a draft one character over MAX_DRAFT_CHARS", () => {
    const overLimit = "a".repeat(MAX_DRAFT_CHARS + 1);
    const bounded = boundDraftText(overLimit);
    expect(bounded.length).toBe(MAX_DRAFT_CHARS);
    expect(bounded).toBe("a".repeat(MAX_DRAFT_CHARS));
  });

  it("truncates a much longer draft down to MAX_DRAFT_CHARS, not rejecting it", () => {
    const huge = "x".repeat(MAX_DRAFT_CHARS * 10);
    const bounded = boundDraftText(huge);
    expect(bounded.length).toBe(MAX_DRAFT_CHARS);
  });
});
