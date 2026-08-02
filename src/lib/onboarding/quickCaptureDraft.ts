// Hand a dashboard quick-capture draft to the capture form WITHOUT putting the
// user's prediction text in the URL. A GET form (the old approach) serialized the
// claim into `/predictions/new?draft=<text>`, which lands in browser history, the
// Referer header, and access logs — a violation of the CLAUDE.md rule that user
// content never appears in URLs or logs. Instead the draft rides sessionStorage
// and the navigation target is a bare path with no query string.

export const QUICK_DRAFT_KEY = "ivyra:quickCaptureDraft";

/** The capture route the quick-capture box navigates to — deliberately no query
 *  string, so the URL never carries prediction content. */
export const CAPTURE_PATH = "/predictions/new";

/** Stash a non-empty, trimmed draft. Returns whether anything was stored. */
export function stashQuickDraft(storage: Pick<Storage, "setItem">, text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === "") return false;
  storage.setItem(QUICK_DRAFT_KEY, trimmed);
  return true;
}

/**
 * Read AND clear the stashed draft — a one-shot handoff, so a later back-nav or
 * refresh doesn't silently re-fill the form. Returns null when there's nothing
 * (or only whitespace) to hand off.
 */
export function takeQuickDraft(storage: Pick<Storage, "getItem" | "removeItem">): string | null {
  const value = storage.getItem(QUICK_DRAFT_KEY);
  if (value !== null) storage.removeItem(QUICK_DRAFT_KEY);
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
