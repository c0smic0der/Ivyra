"use server";

import { embedText } from "@/lib/ai/embedding";
import { countAiCallsToday, logAiCall } from "@/lib/ai/enrich";
import { isUnderDailyCap } from "@/lib/ai/enrichCore";
import { createClient } from "@/lib/supabase/server";
import { matchBaseRateKind } from "@/lib/trackRecord/baseRateHeuristic";
import { getBaseRate } from "@/lib/trackRecord/baseRates";
import { boundDraftText, MIN_DRAFT_CHARS } from "@/lib/trackRecord/draftText";
import { computeTrackRecord, gateMatches, trackRecordSentence } from "@/lib/trackRecord/matching";
import { findSimilarResolvedPredictions } from "@/lib/trackRecord/query";

// Read-only Server Action (never calls revalidatePath/redirect/cookies), so
// Next does not re-render the route on each debounced call — see the plan's
// note on why this stays a Server Action rather than a Route Handler despite
// Next's own guidance for frequent, abortable reads.

export interface TrackRecordMatchView {
  text: string;
  confidencePercent: number;
  outcome: boolean;
  resolvedAt: string;
}

export type TrackRecordPanelResult =
  | {
      kind: "track_record";
      count: number;
      avgConfidencePercent: number;
      hitRatePercent: number;
      sentence: string;
      matches: TrackRecordMatchView[];
    }
  | {
      kind: "base_rate";
      baseRateKind: string;
      ratePercent: number;
      description: string | null;
      sentence: string;
    }
  | { kind: "none" };

export async function getTrackRecordPanel(draftText: string): Promise<TrackRecordPanelResult> {
  // Untrusted client input — re-validate server-side even though the client
  // hook already gates on this. This is a public POST endpoint, reachable
  // directly and not only from the rendered form, so `bounded` (capped at
  // MAX_DRAFT_CHARS) — not the raw draftText — is what reaches embedText
  // below, protecting the real embedding call once it's wired up, not just
  // today's stub.
  const bounded = boundDraftText(draftText);
  if (bounded.length < MIN_DRAFT_CHARS) return { kind: "none" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "none" };

  const callsToday = await countAiCallsToday(user.id);
  if (isUnderDailyCap(callsToday)) {
    const start = Date.now();
    const embedding = await embedText(bounded, null);
    if (embedding) {
      // Only log when a real call happened — embedText is currently a stub
      // that always returns null, so this branch is dead until it's wired
      // up (Session 5). TODO once real: input/output token accounting and
      // per-provider cost, not the hardcoded Haiku rate logAiCall assumes.
      await logAiCall({
        userId: user.id,
        predictionId: null,
        purpose: "track_record_embed",
        model: "text-embedding-3-small",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - start,
      });

      const matches = await findSimilarResolvedPredictions(user.id, embedding);
      const gated = gateMatches(matches);
      if (gated) {
        const stats = computeTrackRecord(gated);
        return {
          kind: "track_record",
          count: stats.count,
          avgConfidencePercent: Math.round(stats.avgConfidence * 100),
          hitRatePercent: Math.round(stats.hitRate * 100),
          sentence: trackRecordSentence(stats),
          matches: gated.map((match) => ({
            text: match.text,
            confidencePercent: Math.round(match.confidence * 100),
            outcome: match.outcome,
            resolvedAt: match.resolvedAt,
          })),
        };
      }
    }
  }

  const baseRateKind = matchBaseRateKind(bounded);
  if (!baseRateKind) return { kind: "none" };

  const baseRate = await getBaseRate(baseRateKind);
  if (!baseRate) return { kind: "none" };

  const ratePercent = Math.round(baseRate.rate * 100);
  return {
    kind: "base_rate",
    baseRateKind: baseRate.kind,
    ratePercent,
    description: baseRate.description,
    sentence: `Outside view: similar things happen ~${ratePercent}% of the time.`,
  };
}
