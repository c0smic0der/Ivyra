"use client";

import { useSyncExternalStore } from "react";
import { formatEntryDate } from "@/lib/date/entryDate";

// A never-changing store: the date is read once per render, and the value only
// changes across days (not within a session), so there is nothing to subscribe
// to. `emptySubscribe` satisfies the hook's contract without a listener.
const emptySubscribe = () => () => {};

/**
 * The new-entry date, rendered in the user's LOCAL timezone. The server (and
 * the hydration pass) render an empty string via the server snapshot; the
 * client snapshot then supplies the browser-zone date — so a 9pm entry in New
 * York reads as today, not tomorrow's UTC date, with no hydration mismatch.
 * The reserved min-height avoids a layout shift as the label appears.
 */
export function EntryDate() {
  const label = useSyncExternalStore(
    emptySubscribe,
    () => formatEntryDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone),
    () => "",
  );

  return <p className="mt-1 min-h-[1.25rem] text-sm text-ink-secondary">{label}</p>;
}
