// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildInsightsViewModel, type InsightsInput } from "@/lib/insights/insightsCore";
import { buildVerdict } from "@/lib/insights/verdict";
import { biasScore, boldnessRatio, frequencyGap, rollingBrier, verdictTrend } from "@/lib/scoring";
import { InsightsSelectionProvider } from "./InsightsSelection";
import { InsightsOverview } from "./InsightsOverview";

// This test uses jsdom but keeps the chart-heavy paths locked (n below the chart
// gates) so recharts never needs real layout — the structural claims (panels
// gone, each metric once) don't depend on the charts rendering.

const CATEGORIES = ["work", "health", "money"];

function fixture(n: number): InsightsInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p-${i}`,
    text: `Prediction ${i}`,
    confidence: 0.5 + (i % 5) * 0.1,
    outcome: i % 3 !== 0, // ~66% hit rate → a real, non-degenerate gap
    status: "resolved" as const,
    resolvedAt: new Date(Date.UTC(2026, 0, 1 + i)),
    category: CATEGORIES[i % CATEGORIES.length]!,
    reasoningType: null,
  }));
}

function buildProps(n: number) {
  const preds = fixture(n);
  const vm = buildInsightsViewModel(preds);
  const verdict = buildVerdict({
    n: vm.n,
    profile: "miscalibrated",
    biasValue: vm.bias.value,
    gap: frequencyGap(preds),
  });
  const recentSlice = preds.slice(-20);
  return {
    verdict,
    trend: verdictTrend(preds),
    n: vm.n,
    baseline: vm.baselineBrier,
    runningBrier: vm.runningBrier.value,
    bias: vm.bias,
    boldness: vm.boldness,
    curve: vm.curve,
    progress: vm.progress,
    recent: {
      brier: rollingBrier(preds, 20),
      bias: biasScore(recentSlice),
      boldness: boldnessRatio(recentSlice),
    },
    insightSlot: <div data-testid="coach-slot">coach</div>,
  };
}

function renderOverview(n: number) {
  return render(
    <InsightsSelectionProvider>
      <InsightsOverview {...buildProps(n)} />
    </InsightsSelectionProvider>,
  );
}

afterEach(cleanup);

describe("InsightsOverview — narrative redesign", () => {
  it("deletes the three replaced panels (At a glance, Directional bias, standalone Boldness gauge)", () => {
    renderOverview(12);
    // The old KPI cluster and the two standalone scalar cards are gone outright.
    expect(screen.queryByText("At a glance")).toBeNull();
    expect(screen.queryByText("Directional bias")).toBeNull();
    expect(screen.queryByText("Where you stand")).toBeNull();
    // The old boldness gauge's track labels no longer exist anywhere.
    expect(screen.queryByText("Hedging")).toBeNull();
    expect(screen.queryByText("Informative")).toBeNull();
  });

  it("renders each metric exactly once — no metric appears in two places", () => {
    renderOverview(12);
    expect(screen.getAllByText("Running Brier")).toHaveLength(1);
    expect(screen.getAllByText("Bias")).toHaveLength(1);
    expect(screen.getAllByText("Boldness")).toHaveLength(1);
  });

  it("leads with the verdict hero: an overline and the frequency-gap headline", () => {
    renderOverview(12);
    expect(screen.getByText(/Insights · 12 resolved/i)).toBeInTheDocument();
    // The headline quotes the two frequencies from the scoring module.
    expect(screen.getByText(/On average you claimed/i)).toBeInTheDocument();
  });

  it("shows the coach's-note slot and the category breakdown heading", () => {
    renderOverview(12);
    expect(screen.getByTestId("coach-slot")).toBeInTheDocument();
    expect(screen.getByText("Where the overconfidence lives")).toBeInTheDocument();
  });

  it("keeps definitions behind one 'What do these mean?' affordance that toggles open", () => {
    renderOverview(12);
    const toggle = screen.getByRole("button", { name: /what do these mean/i });
    // Collapsed: the definition-list isn't rendered yet.
    expect(document.querySelector("dl")).toBeNull();
    fireEvent.click(toggle);
    expect(document.querySelector("dl")).not.toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("omits the trend sub-line below the sample floor (no placeholder)", () => {
    renderOverview(12); // 12 < VERDICT_TREND_UNLOCK_N, so trend is null
    expect(screen.queryByText(/over your last 20/i)).toBeNull();
  });
});
