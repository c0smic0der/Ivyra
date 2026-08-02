"use client";

// Tracks whether the user has seen the /how-it-works explainer, in localStorage
// (client-side only). Deliberately NOT a cookie or a DB column: it's a per-device
// "have I read the intro" flag, not account state, and the first-login gate that
// reads it lives entirely on the client.
//
// The cardinal rule here is DEFAULT TO SKIPPING, NEVER LOOPING. Every path where
// storage is missing or throws (SSR, private mode, disabled storage) resolves to
// "seen", so the gate can never trap a user in a redirect loop it can't clear.
export const HOW_IT_WORKS_SEEN_KEY = "ivyra_how_it_works_seen";

// Pure core — takes a Storage-like object (or null when unavailable) so it can be
// unit-tested in the node environment without a DOM.
export function readSeen(storage: Storage | null | undefined): boolean {
  if (!storage) return true; // SSR / no storage → treat as seen, never loop
  try {
    return storage.getItem(HOW_IT_WORKS_SEEN_KEY) === "1";
  } catch {
    return true; // access blocked (e.g. private mode) → skip, don't loop
  }
}

export function writeSeen(storage: Storage | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(HOW_IT_WORKS_SEEN_KEY, "1");
  } catch {
    // Best-effort. Worst case readSeen keeps returning true (the throw path),
    // so the explainer simply isn't force-shown again — still no loop.
  }
}

// Browser wrappers used by components. Guard SSR and any access that throws.
function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasSeenHowItWorks(): boolean {
  return readSeen(browserStorage());
}

export function markHowItWorksSeen(): void {
  writeSeen(browserStorage());
}
