import { describe, expect, it } from "vitest";
import {
  bandLabel,
  calibrationBandFilter,
  COMPACT_LIMIT,
  EMPTY_FILTERS,
  EMPTY_PARAMS,
  filterRows,
  hasChartSelection,
  hasManualFilters,
  type HistoryFullParams,
  progressPointFilter,
  progressRangeFilter,
  type RawHistoryRow,
  runHistoryQuery,
  sortRows,
} from "./historyView";

function row(over: Partial<RawHistoryRow> & Pick<RawHistoryRow, "id">): RawHistoryRow {
  return {
    userId: "me",
    text: `Prediction ${over.id}`,
    confidence: 0.7,
    outcome: true,
    status: "resolved",
    category: "work",
    brier: 0.09,
    resolvedAt: "2026-03-01T12:00:00.000Z",
    predictionKind: "world",
    reasoning: `reasoning ${over.id}`,
    planOrDisconfirm: `plan ${over.id}`,
    outcomeNote: `note ${over.id}`,
    postmortem: null,
    ...over,
  };
}

const SET: RawHistoryRow[] = [
  row({ id: "a", text: "Kitchen reno finishes", category: "money", confidence: 0.9, brier: 0.01, resolvedAt: "2026-01-05T00:00:00.000Z" }),
  row({ id: "b", text: "Gym 12 times", category: "health", outcome: false, confidence: 0.6, brier: 0.36, resolvedAt: "2026-02-10T00:00:00.000Z" }),
  row({ id: "c", text: "Ship the feature", category: "work", confidence: 0.7, brier: 0.09, resolvedAt: "2026-03-15T00:00:00.000Z" }),
  row({ id: "d", text: "Ambiguous call", status: "void", outcome: null, brier: null, category: "work", resolvedAt: "2026-04-01T00:00:00.000Z" }),
];

const params = (over: Partial<HistoryFullParams> = {}): HistoryFullParams => ({ ...EMPTY_PARAMS, ...over });

describe("filterRows", () => {
  it("no filters returns everything", () => {
    expect(filterRows(SET, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("text search is case-insensitive substring on the prediction text", () => {
    expect(filterRows(SET, { ...EMPTY_FILTERS, q: "  GYM " }).map((i) => i.id)).toEqual(["b"]);
    expect(filterRows(SET, { ...EMPTY_FILTERS, q: "the" }).map((i) => i.id)).toEqual(["c"]);
  });

  it("category filter", () => {
    expect(filterRows(SET, { ...EMPTY_FILTERS, category: "work" }).map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("outcome filter: yes / no / void are mutually exclusive", () => {
    expect(filterRows(SET, { ...EMPTY_FILTERS, outcome: "yes" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterRows(SET, { ...EMPTY_FILTERS, outcome: "no" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterRows(SET, { ...EMPTY_FILTERS, outcome: "void" }).map((i) => i.id)).toEqual(["d"]);
  });

  it("date range is inclusive on both bounds", () => {
    const r = filterRows(SET, { ...EMPTY_FILTERS, from: "2026-02-10", to: "2026-03-15" });
    expect(r.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("confidence band is left-closed / right-open", () => {
    // [0.6, 0.7): only b (0.6). c is at exactly 0.7 → excluded.
    expect(filterRows(SET, { ...EMPTY_FILTERS, confidenceLow: 0.6, confidenceHigh: 0.7 }).map((i) => i.id)).toEqual(["b"]);
    // [0.7, 0.8): c (0.7) and d (void, 0.7). a (0.9) excluded.
    expect(filterRows(SET, { ...EMPTY_FILTERS, confidenceLow: 0.7, confidenceHigh: 0.8 }).map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("top confidence band [0.9, 1.0] is closed so 1.0 still lands", () => {
    const top = [...SET, row({ id: "e", confidence: 1 })];
    expect(filterRows(top, { ...EMPTY_FILTERS, confidenceLow: 0.9, confidenceHigh: 1 }).map((i) => i.id).sort()).toEqual(["a", "e"]);
  });

  it("chart selection restricts to the given ids; empty array matches nothing", () => {
    expect(filterRows(SET, { ...EMPTY_FILTERS, selectionIds: ["a", "c"] }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterRows(SET, { ...EMPTY_FILTERS, selectionIds: [] })).toHaveLength(0);
  });

  it("selection AND-combines with the manual filters", () => {
    const r = filterRows(SET, { ...EMPTY_FILTERS, selectionIds: ["a", "b", "c"], outcome: "yes" });
    expect(r.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("sortRows", () => {
  it("by date", () => {
    expect(sortRows(SET, "date", "asc").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortRows(SET, "date", "desc").map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("by confidence, ties broken most-recent-first", () => {
    // c and d both sit at 0.7; the newer one (d, April) leads the tie.
    expect(sortRows(SET, "confidence", "asc").map((i) => i.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("by score keeps voids (null Brier) last in BOTH directions", () => {
    expect(sortRows(SET, "score", "asc").map((i) => i.id)).toEqual(["a", "c", "b", "d"]);
    expect(sortRows(SET, "score", "desc").map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("does not mutate the input array", () => {
    const before = SET.map((i) => i.id);
    sortRows(SET, "score", "desc");
    expect(SET.map((i) => i.id)).toEqual(before);
  });
});

describe("runHistoryQuery — scoping", () => {
  // A second user's rows, deliberately overlapping every filterable field, so a
  // scoping bug would surface as a foreign row leaking into ANY filtered result.
  const MIXED: RawHistoryRow[] = [
    ...SET,
    row({ id: "x1", userId: "other", text: "Ship the feature", category: "work", confidence: 0.7, outcome: true }),
    row({ id: "x2", userId: "other", text: "Gym 12 times", category: "health", confidence: 0.6, status: "void", outcome: null, brier: null }),
    row({ id: "x3", userId: "other", text: "Kitchen reno finishes", category: "money", confidence: 0.9 }),
  ];

  const FILTERS: Array<Partial<HistoryFullParams>> = [
    {},
    { q: "the" },
    { q: "gym" },
    { category: "work" },
    { category: "health" },
    { outcome: "yes" },
    { outcome: "no" },
    { outcome: "void" },
    { from: "2026-01-01", to: "2026-12-31" },
    { confidenceLow: 0.7, confidenceHigh: 0.8 },
    { confidenceLow: 0.9, confidenceHigh: 1 },
    { selectionIds: ["a", "c", "x1"] }, // deliberately includes a foreign id
    { sort: "score", dir: "asc" },
    { sort: "confidence", dir: "desc" },
  ];

  it("never returns another user's rows under any filter combination", () => {
    const mine = new Set(SET.map((r) => r.id));
    for (const f of FILTERS) {
      const { items } = runHistoryQuery(MIXED, "me", "full", params({ ...f }));
      for (const item of items) {
        expect(mine.has(item.id), `leak under ${JSON.stringify(f)}: ${item.id}`).toBe(true);
      }
    }
  });

  it("compact mode is user-scoped too", () => {
    const { items, total } = runHistoryQuery(MIXED, "me", "compact");
    expect(items.every((i) => SET.some((s) => s.id === i.id))).toBe(true);
    expect(total).toBe(SET.length);
  });

  it("drops open predictions — only resolved/void are history", () => {
    const withOpen = [...SET, row({ id: "open1", status: "resolved" }), { ...row({ id: "open2" }), status: "open" as const }];
    const { total } = runHistoryQuery(withOpen as RawHistoryRow[], "me", "full", params());
    expect(total).toBe(SET.length + 1); // open2 excluded
  });
});

describe("runHistoryQuery — compact mode", () => {
  it("ignores every filter param and returns most-recent-first", () => {
    const filtered = params({ q: "nonexistent", category: "money", outcome: "no", confidenceLow: 0.99 });
    const { items } = runHistoryQuery(SET, "me", "compact", filtered);
    // Filters ignored → all four present, newest first.
    expect(items.map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("omits score and confidence fields (plain record only)", () => {
    const { items } = runHistoryQuery(SET, "me", "compact");
    const first = items[0]!;
    expect(Object.keys(first).sort()).toEqual(["id", "outcome", "resolvedAt", "status", "text"]);
    expect("confidence" in first).toBe(false);
    expect("brier" in first).toBe(false);
  });

  it("caps at COMPACT_LIMIT", () => {
    const many = Array.from({ length: COMPACT_LIMIT + 5 }, (_, i) =>
      row({ id: `m${i}`, resolvedAt: `2026-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const { items, total } = runHistoryQuery(many, "me", "compact");
    expect(items).toHaveLength(COMPACT_LIMIT);
    expect(total).toBe(COMPACT_LIMIT + 5);
  });
});

describe("runHistoryQuery — full mode paging & projection", () => {
  it("paginates, clamps out-of-range pages, and reports totals", () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      row({ id: `p${String(i).padStart(2, "0")}`, resolvedAt: `2026-06-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
    );
    const p1 = runHistoryQuery(many, "me", "full", params({ page: 1 }));
    expect(p1.items).toHaveLength(20);
    expect(p1).toMatchObject({ total: 45, totalPages: 3, page: 1 });
    expect(runHistoryQuery(many, "me", "full", params({ page: 99 })).page).toBe(3);
    expect(runHistoryQuery(many, "me", "full", params({ page: 0 })).page).toBe(1);
  });

  it("full projection carries the complete record for a self-contained card", () => {
    const { items } = runHistoryQuery(SET, "me", "full", params());
    // Everything a card can show, so it needs no link out to a detail page.
    for (const key of ["reasoning", "planOrDisconfirm", "outcomeNote", "postmortem", "predictionKind", "brier"]) {
      expect(items[0]).toHaveProperty(key);
    }
  });

  it("renders sensibly at 0, 12, and 40 resolutions", () => {
    for (const n of [0, 12, 40] as const) {
      const rows = Array.from({ length: n }, (_, i) =>
        row({ id: `n${i}`, resolvedAt: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z` }),
      );
      const res = runHistoryQuery(rows, "me", "full", params());
      expect(res.total).toBe(n);
      expect(res.totalPages).toBe(Math.max(1, Math.ceil(n / 20)));
      expect(res.items.length).toBe(Math.min(n, 20));
      expect(res.page).toBe(1);
    }
  });
});

describe("chart-click → filter mapping", () => {
  it("bandLabel formats a decile as a percent band", () => {
    expect(bandLabel(0.7, 0.8)).toBe("70–80% confidence");
    expect(bandLabel(0.9, 1)).toBe("90–100% confidence");
  });

  it("calibration dot → confidence-band filter", () => {
    const f = calibrationBandFilter({ low: 0.7, high: 0.8 });
    expect(f.label).toBe("70–80% confidence");
    expect(f.patch).toEqual({ confidenceLow: 0.7, confidenceHigh: 0.8 });
    expect(f.nRange).toBeUndefined(); // calibration selections don't draw a progress box

    // The mapped filter, applied, selects exactly that band's members.
    const matched = filterRows(SET, { ...EMPTY_FILTERS, ...f.patch }).map((i) => i.id);
    expect(matched).toEqual(["c", "d"]);
  });

  it("progress single point → that one resolution", () => {
    const f = progressPointFilter({ n: 12, predictionId: "c" });
    expect(f.label).toBe("Resolution #12");
    expect(f.patch).toEqual({ selectionIds: ["c"] });
    expect(f.nRange).toEqual([12, 12]);
  });

  it("progress range → the resolutions in range (collapsing to a single point)", () => {
    const trend = [
      { n: 1, predictionId: "a" },
      { n: 2, predictionId: "b" },
      { n: 3, predictionId: "c" },
    ];
    const range = progressRangeFilter(trend, 1, 2);
    expect(range?.patch).toEqual({ selectionIds: ["a", "b"] });
    expect(range?.label).toBe("Resolutions #1–#2 (2)");
    expect(range?.nRange).toEqual([1, 2]);

    // A single-point drag collapses to the single-resolution shape.
    const single = progressRangeFilter(trend, 3, 3);
    expect(single).toEqual(progressPointFilter({ n: 3, predictionId: "c" }));

    // An empty range yields no filter.
    expect(progressRangeFilter(trend, 9, 10)).toBeNull();
  });
});

describe("filter-state predicates", () => {
  it("hasManualFilters ignores chart selection and defaults", () => {
    expect(hasManualFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasManualFilters({ ...EMPTY_FILTERS, selectionIds: ["x"] })).toBe(false);
    expect(hasManualFilters({ ...EMPTY_FILTERS, confidenceLow: 0.7 })).toBe(false);
    expect(hasManualFilters({ ...EMPTY_FILTERS, q: "x" })).toBe(true);
    expect(hasManualFilters({ ...EMPTY_FILTERS, outcome: "void" })).toBe(true);
  });

  it("hasChartSelection detects a band or an id set", () => {
    expect(hasChartSelection(EMPTY_FILTERS)).toBe(false);
    expect(hasChartSelection({ ...EMPTY_FILTERS, selectionIds: [] })).toBe(true);
    expect(hasChartSelection({ ...EMPTY_FILTERS, confidenceHigh: 0.8 })).toBe(true);
  });
});
