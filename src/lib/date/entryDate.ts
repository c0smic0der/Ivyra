/**
 * Format the calendar date shown in a new journal entry's header.
 *
 * Display-only — nothing is stored differently. It MUST render in the user's
 * LOCAL timezone: an entry written at 11:30pm in New York is still "today"
 * there, but that instant has already rolled past midnight in UTC, so a UTC
 * render would show tomorrow's date. Client callers pass the browser's
 * resolved zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`).
 */
export function formatEntryDate(date: Date, timeZone: string, locale = "en-GB"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone,
  }).format(date);
}
