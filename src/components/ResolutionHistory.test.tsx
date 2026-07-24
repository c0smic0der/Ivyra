import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The component imports the fetchHistory server action, which transitively pulls
// in the DB client (and would throw at import without DATABASE_URL). The action
// only runs inside an effect — never during the initial static render we test
// here — so we stub the module purely to keep the import graph DB-free.
vi.mock("@/app/insights/historyActions", () => ({
  fetchHistory: async () => ({ ok: false, error: "unexpected" }),
}));

import { InsightsSelectionProvider } from "@/app/insights/InsightsSelection";
import {
  type CompactHistoryItem,
  EMPTY_PARAMS,
  type RawHistoryRow,
  runHistoryQuery,
} from "@/lib/insights/historyView";
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

function renderFull(n: number, focusId: string | null = null): string {
  const initial = runHistoryQuery(rawRows(n), "me", "full", EMPTY_PARAMS);
  return renderToStaticMarkup(
    <InsightsSelectionProvider>
      <ResolutionHistory mode="full" initial={initial} focusId={focusId} />
    </InsightsSelectionProvider>,
  );
}

describe("ResolutionHistory — full mode layout", () => {
  it("renders a purposeful empty state at 0 resolutions", () => {
    const html = renderFull(0);
    expect(html).toContain("0 results");
    expect(html).toContain("No predictions match");
    expect(html).not.toContain("Page 1 of"); // no pagination on an empty set
  });

  it("renders every row and no pagination at 12 (one page)", () => {
    const html = renderFull(12);
    expect(html).toContain("1–12 of 12");
    expect(html).toContain("Prediction number 0");
    expect(html).not.toContain("Page 1 of");
  });

  it("renders a bounded first page and pagination at 40 (multiple pages)", () => {
    const html = renderFull(40);
    expect(html).toContain("1–20 of 40"); // one bounded page, not all 40
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("Resolution history");
  });
});

describe("ResolutionHistory — self-contained cards", () => {
  it("collapsed cards show the essentials but hide the frozen record — and never link out", () => {
    const html = renderFull(5);
    expect(html).toContain("Brier"); // score line is part of the collapsed essentials
    expect(html).not.toContain("reasoning 0"); // frozen record hidden until expanded
    expect(html).not.toContain("Looking back");
    expect(html).not.toContain("Open full detail"); // no link out to a detail page
    expect(html).not.toContain("/predictions/"); // no per-resolution route link anywhere
  });

  it("a focused (deep-linked) card renders expanded with the complete record", () => {
    const html = renderFull(5, "p00");
    expect(html).toContain("Your frozen reasoning");
    expect(html).toContain("reasoning 0");
    expect(html).toContain("What would change your mind"); // plan label for a 'world' prediction
    expect(html).toContain("plan 0");
    expect(html).toContain("What happened");
    expect(html).toContain("note 0");
    expect(html).toContain("Looking back");
    expect(html).toContain("pm 0");
    // Still no link out, even expanded.
    expect(html).not.toContain("/predictions/");
  });
});

describe("ResolutionHistory — compact mode", () => {
  const items: CompactHistoryItem[] = runHistoryQuery(rawRows(3), "me", "compact").items;

  it("shows the plain record with a View all link", () => {
    const html = renderToStaticMarkup(<ResolutionHistory mode="compact" items={items} />);
    expect(html).toContain("Recent resolutions");
    expect(html).toContain("View all");
    expect(html).toContain("/insights#history");
  });

  it("a row opens the focused card on /insights, not a detail page", () => {
    const html = renderToStaticMarkup(<ResolutionHistory mode="compact" items={items} />);
    expect(html).toContain("/insights?resolution=p00#history");
    expect(html).not.toContain("/predictions/");
  });

  it("omits scoring and confidence from the glance", () => {
    const html = renderToStaticMarkup(<ResolutionHistory mode="compact" items={items} />);
    expect(html).not.toContain("confident");
    expect(html).not.toContain("Brier");
  });

  it("renders a purposeful empty state when there are none", () => {
    const html = renderToStaticMarkup(<ResolutionHistory mode="compact" items={[]} />);
    expect(html).toContain("Nothing resolved yet");
    expect(html).toContain("View all");
  });
});
