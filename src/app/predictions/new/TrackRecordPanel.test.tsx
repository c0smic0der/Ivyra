import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TrackRecordPanel } from "./TrackRecordPanel";
import type { TrackRecordMatch, TrackRecordPanelResult } from "./trackRecordAction";

// No jsdom in this repo — render to a static HTML string (pure node) and assert.
// The panel is presentational + a pure band selection, so static markup exercises
// exactly the band-vs-fallback branch for a given confidence.

const match = (confidence: number, outcome: boolean): TrackRecordMatch => ({
  text: "ship the redesign by the 15th",
  confidence,
  outcome,
  resolvedAt: "2026-01-01T00:00:00Z",
});

describe("TrackRecordPanel — personal band sentence", () => {
  it("renders the accent-tinted personal record when a band clears MIN_MATCHES", () => {
    const result: TrackRecordPanelResult = {
      kind: "data",
      matches: [match(0.9, false), match(0.85, true), match(0.8, false)],
      baseRate: { ratePercent: 35, description: null },
    };
    const html = renderToStaticMarkup(<TrackRecordPanel result={result} confidencePercent={80} />);
    expect(html).toContain("Before you save");
    expect(html).toContain("You&#x27;ve said 80% or higher on 3 calls like this. 1 landed.");
    expect(html).toContain("bg-accent-tint");
    // Does NOT show the static fallback when it has personal data.
    expect(html).not.toContain("in general");
  });
});

describe("TrackRecordPanel — thin-history fallback", () => {
  it("renders the plain general base-rate line when no band reaches MIN_MATCHES", () => {
    const result: TrackRecordPanelResult = {
      kind: "data",
      matches: [match(0.8, true)], // only one similar call — below MIN_MATCHES
      baseRate: { ratePercent: 35, description: null },
    };
    const html = renderToStaticMarkup(<TrackRecordPanel result={result} confidencePercent={80} />);
    expect(html).toContain("in general");
    expect(html).toContain("35%");
    expect(html).not.toContain("Before you save");
  });

  it("a failed embedding (no matches) degrades to the fallback, not an error", () => {
    // The action returns empty matches when the embed returns null; the panel
    // must still render the outside-view line rather than break the form.
    const result: TrackRecordPanelResult = {
      kind: "data",
      matches: [],
      baseRate: { ratePercent: 40, description: null },
    };
    const html = renderToStaticMarkup(<TrackRecordPanel result={result} confidencePercent={75} />);
    expect(html).toContain("in general");
    expect(html).toContain("40%");
  });

  it("renders nothing when there is neither personal data nor a base rate", () => {
    const result: TrackRecordPanelResult = { kind: "data", matches: [], baseRate: null };
    expect(renderToStaticMarkup(<TrackRecordPanel result={result} confidencePercent={80} />)).toBe("");
  });
});

describe("TrackRecordPanel — empty states", () => {
  it("renders nothing for kind 'none'", () => {
    expect(
      renderToStaticMarkup(<TrackRecordPanel result={{ kind: "none" }} confidencePercent={80} />),
    ).toBe("");
  });

  it("renders nothing for a null result", () => {
    expect(renderToStaticMarkup(<TrackRecordPanel result={null} confidencePercent={80} />)).toBe("");
  });
});
