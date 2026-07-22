"use client";

// The only module that touches localStorage for the onboarding flag. Must
// only ever be called from a useEffect/event handler, never during render.
const KEY = "caliber:onboarded";

export function isOnboarded(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Never loop a user through onboarding because storage is unavailable.
    return true;
  }
}

export function markOnboarded(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Best-effort; worst case they see onboarding again next login.
  }
}
