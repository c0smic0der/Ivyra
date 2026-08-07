// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Same DB-free stub the sibling render test uses: the fetch action only runs in
// an effect, never during these interactions.
vi.mock("@/app/insights/historyActions", () => ({
  fetchHistory: async () => ({ ok: false, error: "unexpected" }),
}));

import { InsightsSelectionProvider } from "@/app/insights/InsightsSelection";
import { EMPTY_PARAMS, type RawHistoryRow, runHistoryQuery } from "@/lib/insights/historyView";
import { ResolutionHistory } from "./ResolutionHistory";

function rawRows(n: number): RawHistoryRow[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: "me",
    id: `p${String(i).padStart(2, "0")}`,
    text: `Prediction number ${i}`,
    confidence: 0.7,
    outcome: i % 2 === 0,
    status: "resolved" as const,
    category: "work",
    brier: 0.09,
    resolvedAt: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
    predictionKind: "world" as const,
    reasoning: `reasoning ${i}`,
    planOrDisconfirm: `plan ${i}`,
    outcomeNote: `note ${i}`,
    postmortem: `pm ${i}`,
  }));
}

function renderHistory(n: number) {
  const initial = runHistoryQuery(rawRows(n), "me", "full", EMPTY_PARAMS);
  return render(
    <InsightsSelectionProvider>
      <ResolutionHistory mode="full" initial={initial} focusId={null} />
    </InsightsSelectionProvider>,
  );
}

afterEach(cleanup);

describe("ResolutionHistory — collapsible search/filter bank", () => {
  it("collapses the filter bank behind one affordance, expanding it in place on click", () => {
    const { container } = renderHistory(6);
    const toggle = screen.getByRole("button", { name: /search & filter/i });

    // Collapsed: the bank (and its search input) isn't in the DOM, and the
    // affordance says so.
    expect(container.querySelector("#history-filter-bank")).toMatchSnapshot("filter-bank-collapsed");
    expect(screen.queryByPlaceholderText(/search your predictions/i)).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Expanded in place: the search input and the filter controls appear.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByPlaceholderText(/search your predictions/i)).toBeInTheDocument();
    expect(container.querySelector("#history-filter-bank")).toMatchSnapshot("filter-bank-expanded");
  });
});
