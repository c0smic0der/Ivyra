import type { TrackRecordPanelResult } from "./trackRecordAction";

export function TrackRecordPanel({ result }: { result: TrackRecordPanelResult | null }) {
  if (!result || result.kind === "none") return null;

  if (result.kind === "track_record") {
    return (
      <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
        <p>{result.sentence}</p>
        <details className="mt-2 text-zinc-500">
          <summary className="cursor-pointer">Show matched predictions</summary>
          <ul className="mt-2 list-disc pl-5 text-zinc-600 dark:text-zinc-400">
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
    <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      {result.sentence}
    </div>
  );
}
