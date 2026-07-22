"use client";

// Cookie (not localStorage) so the server component in onboarding/page.tsx can
// read it and redirect before ever rendering — no client-side flash/delay.
import { ONBOARDED_COOKIE_NAME } from "./onboardedCookie";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function markOnboarded(): void {
  try {
    document.cookie = `${ONBOARDED_COOKIE_NAME}=1; path=/; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
  } catch {
    // Best-effort; worst case they see onboarding again next visit.
  }
}
