import type { TrackRecordPanelResult } from "./trackRecordAction";

export function TrackRecordPanel({ result }: { result: TrackRecordPanelResult | null }) {
  if (!result || result.kind === "none") return null;

  if (result.kind === "track_record") {
    return (
      <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink">
        <p>{result.sentence}</p>
        <details className="mt-2 text-ink-secondary">
          <summary className="cursor-pointer">Show matched predictions</summary>
          <ul className="mt-2 list-disc pl-5 text-ink-secondary">
            {result.matches.map((match, i) => (
              <li key={i}>
                {match.text} — {match.confidencePercent}% confidence,{" "}
                {match.outcome ? "came true" : "did not happen"}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink-secondary">
      {result.sentence}
    </div>
  );
}
