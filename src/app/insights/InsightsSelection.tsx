"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * A selection made on the progress chart, shared with the resolution history so
 * clicking a point or dragging a range filters the list in place (no
 * navigation). `ids` are the selected predictions; `label` describes the
 * selection for the chip; `nRange` is the chart-index span so the chart can draw
 * the committed selection back onto itself.
 */
export interface ChartSelection {
  ids: string[];
  label: string;
  nRange: [number, number];
}

interface SelectionContextValue {
  selection: ChartSelection | null;
  setSelection: (selection: ChartSelection | null) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function InsightsSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  return (
    <SelectionContext.Provider value={{ selection, setSelection }}>{children}</SelectionContext.Provider>
  );
}

export function useInsightsSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useInsightsSelection must be used within InsightsSelectionProvider");
  return ctx;
}
