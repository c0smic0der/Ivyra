"use server";

import { requireUser } from "@/lib/auth/requireUser";
import { queryJournal, queryJournalWindow } from "@/lib/journal/journalQuery";
import type { JournalPage } from "@/lib/journal/journalView";

// Server Actions backing the timeline's "Load more" and its restore-on-return.
// Both re-authenticate and scope every read to the caller's own id — the page
// number is the only thing the client controls, never the user filter. Prediction
// content is returned in the view model only; it never enters an argument or URL.

/** Fetch the next page of the caller's timeline. */
export async function loadMoreJournal(page: number): Promise<JournalPage> {
  const user = await requireUser();
  return queryJournal(user.id, page);
}

/**
 * Refetch the first `pageCount` pages as one window. Called when the user comes
 * back from resolving an entry, so the pages they had open are restored fresh —
 * a just-resolved entry shows its updated annotation without resetting to page 1.
 */
export async function restoreJournal(pageCount: number): Promise<JournalPage> {
  const user = await requireUser();
  return queryJournalWindow(user.id, pageCount);
}
