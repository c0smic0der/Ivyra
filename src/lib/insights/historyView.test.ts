import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  filterHistory,
  hasManualFilters,
  type HistoryItem,
  paginate,
  sortHistory,
} from "./historyView";

function item(over: Partial<HistoryItem> & Pick<HistoryItem, "id">): HistoryItem {
  return {
    text: `Prediction ${over.id}`,
    confidence: 0.7,
    outcome: true,
    status: "resolved",
    category: "work",
    brier: 0.09,
    resolvedAt: "2026-03-01T12:00:00.000Z",
    ...over,
  };
}

const SET: HistoryItem[] = [
  item({ id: "a", text: "Kitchen reno finishes", category: "money", confidence: 0.9, brier: 0.01, resolvedAt: "2026-01-05T00:00:00.000Z" }),
  item({ id: "b", text: "Gym 12 times", category: "health", outcome: false, confidence: 0.6, brier: 0.36, resolvedAt: "2026-02-10T00:00:00.000Z" }),
  item({ id: "c", text: "Ship the feature", category: "work", confidence: 0.7, brier: 0.09, resolvedAt: "2026-03-15T00:00:00.000Z" }),
  item({ id: "d", text: "Ambiguous call", status: "void", outcome: null, brier: null, category: "work", resolvedAt: "2026-04-01T00:00:00.000Z" }),
];

describe("filterHistory", () => {
  it("no filters returns everything", () => {
    expect(filterHistory(SET, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("text search is case-insensitive substring on the prediction text", () => {
    expect(filterHistory(SET, { ...EMPTY_FILTERS, q: "  GYM " }).map((i) => i.id)).toEqual(["b"]);
    expect(filterHistory(SET, { ...EMPTY_FILTERS, q: "the" }).map((i) => i.id)).toEqual(["c"]);
  });

  it("category filter", () => {
    expect(filterHistory(SET, { ...EMPTY_FILTERS, category: "work" }).map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("outcome filter: yes / no / void are mutually exclusive", () => {
    expect(filterHistory(SET, { ...EMPTY_FILTERS, outcome: "yes" }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterHistory(SET, { ...EMPTY_FILTERS, outcome: "no" }).map((i) => i.id)).toEqual(["b"]);
    expect(filterHistory(SET, { ...EMPTY_FILTERS, outcome: "void" }).map((i) => i.id)).toEqual(["d"]);
  });

  it("date range is inclusive on both bounds", () => {
    const r = filterHistory(SET, { ...EMPTY_FILTERS, from: "2026-02-10", to: "2026-03-15" });
    expect(r.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("chart selection restricts to the given ids; empty array matches nothing", () => {
    expect(filterHistory(SET, { ...EMPTY_FILTERS, selectionIds: ["a", "c"] }).map((i) => i.id)).toEqual(["a", "c"]);
    expect(filterHistory(SET, { ...EMPTY_FILTERS, selectionIds: [] })).toHaveLength(0);
  });

  it("selection AND-combines with the manual filters", () => {
    const r = filterHistory(SET, { ...EMPTY_FILTERS, selectionIds: ["a", "b", "c"], outcome: "yes" });
    expect(r.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("sortHistory", () => {
  it("by date", () => {
    expect(sortHistory(SET, "date", "asc").map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortHistory(SET, "date", "desc").map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("by confidence, ties broken most-recent-first", () => {
    // c and d both sit at 0.7; the newer one (d, April) leads the tie.
    expect(sortHistory(SET, "confidence", "asc").map((i) => i.id)).toEqual(["b", "d", "c", "a"]);
  });

  it("by score keeps voids (null Brier) last in BOTH directions", () => {
    expect(sortHistory(SET, "score", "asc").map((i) => i.id)).toEqual(["a", "c", "b", "d"]);
    expect(sortHistory(SET, "score", "desc").map((i) => i.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("does not mutate the input array", () => {
    const before = SET.map((i) => i.id);
    sortHistory(SET, "score", "desc");
    expect(SET.map((i) => i.id)).toEqual(before);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);

  it("returns the right slice and metadata", () => {
    const p = paginate(items, 1, 20);
    expect(p.pageItems).toHaveLength(20);
    expect(p).toMatchObject({ page: 1, total: 45, totalPages: 3 });
    expect(paginate(items, 3, 20).pageItems).toEqual([40, 41, 42, 43, 44]);
  });

  it("clamps out-of-range pages", () => {
    expect(paginate(items, 99, 20).page).toBe(3);
    expect(paginate(items, 0, 20).page).toBe(1);
    expect(paginate([], 1, 20)).toMatchObject({ total: 0, totalPages: 1, page: 1 });
  });
});

describe("hasManualFilters", () => {
  it("ignores the chart selection and defaults", () => {
    expect(hasManualFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasManualFilters({ ...EMPTY_FILTERS, selectionIds: ["x"] })).toBe(false);
    expect(hasManualFilters({ ...EMPTY_FILTERS, q: "x" })).toBe(true);
    expect(hasManualFilters({ ...EMPTY_FILTERS, outcome: "void" })).toBe(true);
  });
});
