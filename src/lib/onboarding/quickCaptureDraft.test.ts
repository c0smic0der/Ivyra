import { describe, expect, it } from "vitest";
import {
  CAPTURE_PATH,
  QUICK_DRAFT_KEY,
  stashQuickDraft,
  takeQuickDraft,
} from "./quickCaptureDraft";

// A minimal in-memory Storage stand-in — the handoff logic is pure over the
// sessionStorage interface, so no jsdom is needed.
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    setItem: (k: string, v: string) => void map.set(k, v),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    removeItem: (k: string) => void map.delete(k),
    has: (k: string) => map.has(k),
  };
}

describe("quick-capture draft handoff (draft never touches the URL)", () => {
  it("navigates to a clean capture path with no query string", () => {
    expect(CAPTURE_PATH).toBe("/predictions/new");
    expect(CAPTURE_PATH).not.toContain("?"); // no ?draft=, no content in the URL
  });

  it("stashes a draft in storage and hands it back once, then clears it", () => {
    const s = fakeStorage();
    expect(stashQuickDraft(s, "We ship the redesign by the 15th")).toBe(true);
    expect(s.has(QUICK_DRAFT_KEY)).toBe(true);

    // The capture form reads it on mount, prefilled…
    expect(takeQuickDraft(s)).toBe("We ship the redesign by the 15th");
    // …and it's gone, so a refresh or back-nav won't silently re-fill.
    expect(s.has(QUICK_DRAFT_KEY)).toBe(false);
    expect(takeQuickDraft(s)).toBeNull();
  });

  it("trims the draft and refuses to stash empty/whitespace", () => {
    const s = fakeStorage();
    expect(stashQuickDraft(s, "   ")).toBe(false);
    expect(stashQuickDraft(s, "")).toBe(false);
    expect(s.has(QUICK_DRAFT_KEY)).toBe(false);

    expect(stashQuickDraft(s, "  padded draft  ")).toBe(true);
    expect(takeQuickDraft(s)).toBe("padded draft");
  });

  it("returns null (not an empty string) when nothing is stashed", () => {
    expect(takeQuickDraft(fakeStorage())).toBeNull();
  });
});
