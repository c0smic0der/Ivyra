"use server";

import { embeddingCostUsd, embedTextWithUsage, OPENAI_EMBEDDING_MODEL } from "@/lib/ai/embedding";
import { finalizeAiCall, releaseAiCall, reserveAiCallIfUnderCap } from "@/lib/ai/enrich";
import { createClient } from "@/lib/supabase/server";
import { matchBaseRateKind } from "@/lib/trackRecord/baseRateHeuristic";
import { getBaseRate } from "@/lib/trackRecord/baseRates";
import { boundDraftText, MIN_DRAFT_CHARS } from "@/lib/trackRecord/draftText";
import { findSimilarResolvedPredictions } from "@/lib/trackRecord/query";

// Read-only Server Action (never calls revalidatePath/redirect/cookies), so
// Next does not re-render the route on each debounced call — see the plan's
// note on why this stays a Server Action rather than a Route Handler despite
// Next's own guidance for frequent, abortable reads.
//
// This call is keyed on the DRAFT TEXT only. The embedding (the billed,
// cap-gated OpenAI call) depends solely on the text; the confidence band the
// panel reports is selected client-side over the matches returned here, so
// dragging the confidence slider recomputes the sentence LIVE without ever
// re-embedding or spending another daily-cap slot.

/** One of the user's own resolved calls similar to the draft. Their own data —
 * scoped to `user.id` by the query — so returning it to their own client is safe. */
export interface TrackRecordMatch {
  text: string;
  /** Stated confidence in [0, 1]; the client bands and rounds it for display. */
  confidence: number;
  outcome: boolean;
  resolvedAt: string;
}

export interface BaseRateLine {
  ratePercent: number;
  description: string | null;
}

export type TrackRecordPanelResult =
  | {
      kind: "data";
      /** Similarity-gated resolved calls of the user's own; may be empty. */
      matches: TrackRecordMatch[];
      /** Static outside-view line for the thin-history fallback; null if none matched. */
      baseRate: BaseRateLine | null;
    }
  | { kind: "none" };

export async function getTrackRecordPanel(draftText: string): Promise<TrackRecordPanelResult> {
  // Untrusted client input — re-validate server-side even though the client hook
  // already gates on this. This is a public POST endpoint, reachable directly and
  // not only from the rendered form, so `bounded` (capped at MAX_DRAFT_CHARS) —
  // not raw draftText — is what reaches the billed embedding call.
  const bounded = boundDraftText(draftText);
  if (bounded.length < MIN_DRAFT_CHARS) return { kind: "none" };

  // The panel is a non-essential capture-time sidebar. Any failure here (auth,
  // embedding, similarity query, base-rate lookup) degrades to "none" — the panel
  // silently disappears rather than breaking the create form.
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "none" };

    let matches: TrackRecordMatch[] = [];

    // Atomically reserve the daily-cap slot before the embed (null => over cap).
    // Finalized with the real OpenAI cost on a hit, or released if no vector comes
    // back, so a failed/no-key embed never burns the cap.
    const callId = await reserveAiCallIfUnderCap({
      userId: user.id,
      predictionId: null,
      purpose: "track_record_embed",
      model: OPENAI_EMBEDDING_MODEL,
    });
    if (callId !== null) {
      const start = Date.now();
      const embedResult = await embedTextWithUsage(bounded, null);
      if (embedResult) {
        await finalizeAiCall(callId, user.id, {
          inputTokens: embedResult.inputTokens,
          outputTokens: 0,
          costUsd: embeddingCostUsd(embedResult.inputTokens),
          latencyMs: Date.now() - start,
        });
        // Scoped to the authenticated user's OWN resolved rows by the query's
        // mandatory eq(user_id) filter (the privileged DATABASE_URL bypasses RLS).
        const similar = await findSimilarResolvedPredictions(user.id, embedResult.embedding);
        matches = similar.map((m) => ({
          text: m.text,
          confidence: m.confidence,
          outcome: m.outcome,
          resolvedAt: m.resolvedAt,
        }));
      } else {
        // No vector (no key / provider failure): free the reserved slot so the
        // degrade-to-base-rate path doesn't cost the user a cap slot.
        await releaseAiCall(callId, user.id);
      }
    }

    // Always compute the static outside-view line too. The client chooses between
    // the personal band sentence and this fallback based on the live confidence,
    // so both must be available in one round trip.
    const baseRate = await lookupBaseRate(bounded);
    return { kind: "data", matches, baseRate };
  } catch (error) {
    console.error(
      "getTrackRecordPanel: degraded to none",
      error instanceof Error ? error.name : "UnknownError",
    );
    return { kind: "none" };
  }
}

async function lookupBaseRate(bounded: string): Promise<BaseRateLine | null> {
  const kind = matchBaseRateKind(bounded);
  if (!kind) return null;
  const baseRate = await getBaseRate(kind);
  if (!baseRate) return null;
  return { ratePercent: Math.round(baseRate.rate * 100), description: baseRate.description };
}
