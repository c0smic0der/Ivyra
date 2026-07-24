"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { HistoryChartFilter } from "@/lib/insights/historyView";

/**
 * A selection made on either chart, shared with the resolution history so a
 * click filters the list in place (no navigation). The calibration curve
 * contributes a confidence-band filter; the progress chart contributes a
 * specific-resolution(s) filter. `nRange` is present only for progress
 * selections, so that chart can redraw its committed box onto itself.
 */
export type ChartSelection = HistoryChartFilter;

interface SelectionContextValue {
  selection: ChartSelection | null;
  setSelection: (selection: ChartSelection | null) => void;
  /** Commit a selection AND scroll the history into view — the standard
   *  "clicked a chart, take me to the rows" gesture. */
  selectAndScroll: (selection: ChartSelection) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function InsightsSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ChartSelection | null>(null);

  const selectAndScroll = useCallback((next: ChartSelection) => {
    setSelection(next);
    // Defer to the next frame so the filtered list has laid out before we scroll.
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => {
        document.getElementById("history")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  return (
    <SelectionContext.Provider value={{ selection, setSelection, selectAndScroll }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useInsightsSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useInsightsSelection must be used within InsightsSelectionProvider");
  return ctx;
}

/**
 * Non-throwing accessor: returns null when there is no provider. The calibration
 * curve renders both inside /insights (interactive → filters the history) and on
 * the landing page as a static demo (no provider), so it must degrade to null
 * rather than throw.
 */
export function useOptionalInsightsSelection(): SelectionContextValue | null {
  return useContext(SelectionContext);
}
