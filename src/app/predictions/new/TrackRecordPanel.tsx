import {
  bandTrackRecordSentence,
  baseRateFallbackSentence,
  selectBandTrackRecord,
  type SimilarMatch,
} from "@/lib/trackRecord/matching";
import type { TrackRecordPanelResult } from "./trackRecordAction";

// Presentational + the pure band selection. Rendered inside the (client) capture
// form, so `confidencePercent` re-runs selectBandTrackRecord on every slider move
// with zero network — the personal sentence updates live and widens its band
// downward on its own when the current band is too thin (docs/04 §3.3). No LLM,
// no scoring: this states a frequency and stops (CLAUDE.md copy rule).

export function TrackRecordPanel({
  result,
  confidencePercent,
}: {
  result: TrackRecordPanelResult | null;
  confidencePercent: number;
}) {
  if (!result || result.kind === "none") return null;

  // The action returns confidence in [0,1]; selectBandTrackRecord counts by band.
  const matches: SimilarMatch[] = result.matches.map((m) => ({
    text: m.text,
    confidence: m.confidence,
    outcome: m.outcome,
    resolvedAt: m.resolvedAt,
    similarity: 1, // already similarity-gated server-side; band logic ignores it
  }));
  const band = selectBandTrackRecord(matches, confidencePercent);

  if (band) {
    return (
      <div className="rounded-xl border border-accent/25 bg-accent-tint px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Before you save</p>
        <p className="mt-1 text-sm text-ink">{bandTrackRecordSentence(band)}</p>
        <details className="mt-2 text-xs text-ink-secondary">
          <summary className="cursor-pointer">Show matched predictions</summary>
          <ul className="mt-2 list-disc pl-5">
            {result.matches.map((match, i) => (
              <li key={i}>
                {match.text} — {Math.round(match.confidence * 100)}% confidence,{" "}
                {match.outcome ? "came true" : "did not happen"}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  // Thin history: no band clears MIN_MATCHES. Fall back to the static outside
  // view, stated plainly as general — not personal.
  if (result.baseRate) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink-secondary">
        {baseRateFallbackSentence(result.baseRate.ratePercent)}
      </div>
    );
  }

  return null;
}
