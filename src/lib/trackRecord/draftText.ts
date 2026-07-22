// Draft-text bounds for the track-record panel's Server Action. Pure, no
// DB/network, so the boundary is unit-testable without going through
// trackRecordAction.ts (a "use server" file, which can only export async
// functions).
//
// MAX_DRAFT_CHARS exists to protect the embedding call, not just today's
// stub: getTrackRecordPanel is a public POST endpoint reachable directly,
// not only from the rendered form, and the real embedding call it will make
// (OpenAI text-embedding-3-small) is billed per input token — an unbounded
// draftText would mean unbounded per-call cost/latency, only loosely capped
// by the per-user daily call count, not per-call size.

export const MIN_DRAFT_CHARS = 15;
export const MAX_DRAFT_CHARS = 2000;

/**
 * Trims the draft and caps it at MAX_DRAFT_CHARS. Truncates rather than
 * rejects — a long draft should still surface a panel, just computed from
 * its first MAX_DRAFT_CHARS characters.
 */
export function boundDraftText(text: string): string {
  return text.trim().slice(0, MAX_DRAFT_CHARS);
}
