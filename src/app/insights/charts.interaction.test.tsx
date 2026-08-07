// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildInsightsViewModel, type InsightsInput } from "@/lib/insights/insightsCore";
import { BASELINE_BRIER } from "@/lib/scoring";
import { InsightsSelectionProvider } from "./InsightsSelection";
import { ProgressChart } from "./ProgressChart";
import { CalibrationChart } from "./CalibrationChart";

// recharts can't measure a 0×0 jsdom container, so the SVG geometry never
// renders here — but the interactive controls (the mode toggle) and the
// click-to-filter affordance live OUTSIDE the chart surface, so their wiring is
// exactly what these tests exercise. The filter-mapping math itself
// (calibrationBandFilter / progressRangeFilter) is covered by pure tests in
// historyView.test.ts.

function fixture(n: number): InsightsInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    text: `Prediction ${i}`,
    confidence: 0.5 + (i % 5) * 0.1,
    outcome: i % 3 !== 0,
    status: "resolved" as const,
    resolvedAt: new Date(Date.UTC(2026, 0, 1 + i)),
    category: "work",
    reasoningType: null,
  }));
}

const vm = buildInsightsViewModel(fixture(36));

afterEach(cleanup);

describe("chart filter interactions still fire", () => {
  it("the progress chart's recent/lifetime toggle switches the windowed series", () => {
    render(
      <InsightsSelectionProvider>
        <ProgressChart trend={vm.progress.trend} baseline={BASELINE_BRIER} />
      </InsightsSelectionProvider>,
    );

    const recent = screen.getByRole("button", { name: /^recent$/i });
    const lifetime = screen.getByRole("button", { name: /^lifetime$/i });
    // Opens on the recent window.
    expect(recent).toHaveAttribute("aria-pressed", "true");
    expect(lifetime).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(lifetime);
    expect(lifetime).toHaveAttribute("aria-pressed", "true");
    expect(recent).toHaveAttribute("aria-pressed", "false");
  });

  it("the calibration chart keeps its click-to-filter affordance", () => {
    render(
      <InsightsSelectionProvider>
        <CalibrationChart points={vm.curve.points} />
      </InsightsSelectionProvider>,
    );
    expect(screen.getByText(/click a dot to filter your history/i)).toBeInTheDocument();
  });
});
