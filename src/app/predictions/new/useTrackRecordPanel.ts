import { useEffect, useRef, useState, useTransition } from "react";
import { getTrackRecordPanel, type TrackRecordPanelResult } from "./trackRecordAction";

const DEBOUNCE_MS = 800;
const MIN_DRAFT_CHARS = 15;

/**
 * Debounces `text`, calls the track-record Server Action, and guards against
 * a slow, superseded call overwriting a newer result (Server Actions queue
 * sequentially per client and can't be cancelled client-side — see the
 * plan's note on why this stays a Server Action rather than a Route
 * Handler).
 */
export function useTrackRecordPanel(text: string): { result: TrackRecordPanelResult | null; isPending: boolean } {
  const [result, setResult] = useState<TrackRecordPanelResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const requestIdRef = useRef(0);

  const trimmedLength = text.trim().length;

  useEffect(() => {
    if (trimmedLength < MIN_DRAFT_CHARS) return;

    const timer = setTimeout(() => {
      const requestId = ++requestIdRef.current;
      startTransition(async () => {
        const panel = await getTrackRecordPanel(text);
        if (requestId === requestIdRef.current) setResult(panel);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text, trimmedLength]);

  // Derived, not state: masks a stale result the instant the draft drops
  // below the minimum, with no setState-in-effect needed for that case.
  return { result: trimmedLength >= MIN_DRAFT_CHARS ? result : null, isPending };
}
