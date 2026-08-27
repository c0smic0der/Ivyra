import { describe, expect, it } from "vitest";
import { brierScore } from "@/lib/scoring";
import {
  annotationFor,
  entryHref,
  formatResolveDate,
  groupByMonth,
  isDue,
  monthNavFromTimestamps,
  JOURNAL_PAGE_SIZE,
  type JournalRow,
  reasoningPreview,
  runJournalQuery,
  runJournalWindow,
  toJournalEntry,
} from "./journalView";

const UID = "user-1";

function row(overrides: Partial<JournalRow> & Pick<JournalRow, "id" | "createdAt">): JournalRow {
  return {
    userId: UID,
    text: "Some claim",
    decision: null,
    reasoning: null,
    confidence: 0.8,
    resolutionDate: "2026-08-15",
    status: "open",
    outcome: null,
    ...overrides,
  };
}

describe("ordering", () => {
  it("returns entries newest-first by createdAt", () => {
    const rows = [
      row({ id: "a", createdAt: "2026-07-10T12:00:00Z" }),
      row({ id: "b", createdAt: "2026-07-28T12:00:00Z" }),
      row({ id: "c", createdAt: "2026-07-14T12:00:00Z" }),
    ];
    const { items } = runJournalQuery(rows, UID, 1);
    expect(items.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties on equal createdAt deterministically", () => {
    const rows = [
      row({ id: "a", createdAt: "2026-07-10T12:00:00Z" }),
      row({ id: "b", createdAt: "2026-07-10T12:00:00Z" }),
    ];
    const { items } = runJournalQuery(rows, UID, 1);
    // Same order regardless of input order.
    const reversed = runJournalQuery([...rows].reverse(), UID, 1);
    expect(items.map((i) => i.id)).toEqual(reversed.items.map((i) => i.id));
  });
});

describe("month grouping", () => {
  it("splits entries into month sections, newest month first", () => {
    const rows = [
      row({ id: "aug", createdAt: "2026-08-02T12:00:00Z" }),
      row({ id: "jul1", createdAt: "2026-07-28T12:00:00Z" }),
      row({ id: "jul2", createdAt: "2026-07-14T12:00:00Z" }),
      row({ id: "jun", createdAt: "2026-06-30T12:00:00Z" }),
    ];
    const { items } = runJournalQuery(rows, UID, 1);
    const sections = groupByMonth(items, "UTC");
    expect(sections.map((s) => s.label)).toEqual(["AUGUST", "JULY", "JUNE"]);
    expect(sections.map((s) => s.key)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(sections[1].entries.map((e) => e.entry.id)).toEqual(["jul1", "jul2"]);
    expect(sections[1].entries[0].dayLabel).toBe("28 Jul");
  });

  it("groups a month-boundary entry by the supplied timezone, not UTC", () => {
    // 2026-08-01T02:30Z is still July 31 in New York (UTC-4 in summer).
    const rows = [row({ id: "edge", createdAt: "2026-08-01T02:30:00Z" })];
    const { items } = runJournalQuery(rows, UID, 1);

    const utc = groupByMonth(items, "UTC");
    expect(utc[0].label).toBe("AUGUST");
    expect(utc[0].entries[0].dayLabel).toBe("1 Aug");

    const ny = groupByMonth(items, "America/New_York");
    expect(ny[0].label).toBe("JULY");
    expect(ny[0].entries[0].dayLabel).toBe("31 Jul");
  });
});

describe("monthNavFromTimestamps — the full month rail", () => {
  it("lists every distinct month, newest first, regardless of how many entries share one", () => {
    const ts = [
      "2026-09-20T12:00:00Z",
      "2026-08-26T12:00:00Z",
      "2026-08-01T12:00:00Z", // second August entry — still one AUG in the rail
      "2026-04-10T12:00:00Z",
      "2026-03-05T12:00:00Z",
    ];
    const nav = monthNavFromTimestamps(ts, "UTC");
    expect(nav.map((m) => m.key)).toEqual(["2026-09", "2026-08", "2026-04", "2026-03"]);
    expect(nav.map((m) => m.label)).toEqual(["SEPTEMBER", "AUGUST", "APRIL", "MARCH"]);
  });

  it("groups a month-boundary timestamp by the supplied timezone", () => {
    // 2026-08-01T02:30Z is still July 31 in New York.
    const nav = monthNavFromTimestamps(["2026-08-01T02:30:00Z"], "America/New_York");
    expect(nav[0]!.key).toBe("2026-07");
    expect(nav[0]!.label).toBe("JULY");
  });

  it("is empty for no timestamps", () => {
    expect(monthNavFromTimestamps([], "UTC")).toEqual([]);
  });
});

describe("annotation states", () => {
  it("open: confidence percentage, compact resolves date, and the raw resolution date", () => {
    const ann = annotationFor(row({ id: "o", createdAt: "2026-07-28T12:00:00Z", confidence: 0.8 }));
    expect(ann).toEqual({
      kind: "open",
      confidencePct: 80,
      resolvesLabel: "08/15",
      resolutionDate: "2026-08-15",
    });
  });

  it("resolved: outcome plus the scoring module's Brier (no inline math)", () => {
    const miss = annotationFor(
      row({ id: "r", createdAt: "2026-07-21T12:00:00Z", confidence: 0.75, status: "resolved", outcome: false }),
    );
    expect(miss).toEqual({ kind: "resolved", outcome: false, brier: brierScore(0.75, false) });
    expect(miss).toMatchObject({ brier: 0.5625 });

    const hit = annotationFor(
      row({ id: "h", createdAt: "2026-07-14T12:00:00Z", confidence: 0.7, status: "resolved", outcome: true }),
    );
    expect(hit).toEqual({ kind: "resolved", outcome: true, brier: brierScore(0.7, true) });
  });

  it("void: no score, no confidence", () => {
    const ann = annotationFor(
      row({ id: "v", createdAt: "2026-07-01T12:00:00Z", status: "void", outcome: null }),
    );
    expect(ann).toEqual({ kind: "void" });
  });

  it("resolved with a null outcome falls back to open rather than crashing", () => {
    const ann = annotationFor(
      row({ id: "x", createdAt: "2026-07-01T12:00:00Z", status: "resolved", outcome: null }),
    );
    expect(ann.kind).toBe("open");
  });
});

describe("isDue — the shared due rule (bare-date UTC compare)", () => {
  it("is due when the resolution date is today or earlier", () => {
    expect(isDue("2026-08-03", "2026-08-03")).toBe(true); // today
    expect(isDue("2026-07-20", "2026-08-03")).toBe(true); // past
  });
  it("is not due when the resolution date is still in the future", () => {
    expect(isDue("2026-08-15", "2026-08-03")).toBe(false);
    expect(isDue("2026-10-05", "2026-08-03")).toBe(false);
  });
});

describe("entry destination", () => {
  it("open entries link to the resolve screen", () => {
    const e = toJournalEntry(row({ id: "open-1", createdAt: "2026-07-28T12:00:00Z" }));
    expect(e.annotation.kind).toBe("open");
    expect(entryHref(e)).toBe("/predictions/open-1/resolve");
  });

  it("resolved entries link to the read-only record view", () => {
    const e = toJournalEntry(
      row({ id: "res-1", createdAt: "2026-07-21T12:00:00Z", status: "resolved", outcome: true }),
    );
    expect(e.annotation.kind).toBe("resolved");
    expect(entryHref(e)).toBe("/insights?resolution=res-1#history");
  });

  it("void entries link to the record view and carry no Brier", () => {
    const e = toJournalEntry(
      row({ id: "void-1", createdAt: "2026-07-01T12:00:00Z", status: "void", outcome: null }),
    );
    expect(e.annotation).toEqual({ kind: "void" }); // no brier, no confidence
    expect(entryHref(e)).toBe("/insights?resolution=void-1#history");
  });
});

describe("resolves date formatting", () => {
  it("is a compact, zero-padded month/day", () => {
    expect(formatResolveDate("2026-08-15")).toBe("08/15");
    expect(formatResolveDate("2026-01-05")).toBe("01/05");
    expect(formatResolveDate("2026-12-31")).toBe("12/31");
  });
});

describe("reasoning preview truncation", () => {
  it("returns null for empty or whitespace-only reasoning", () => {
    expect(reasoningPreview(null)).toBeNull();
    expect(reasoningPreview("")).toBeNull();
    expect(reasoningPreview("   \n  ")).toBeNull();
  });

  it("collapses internal whitespace and leaves short text intact", () => {
    expect(reasoningPreview("Third week   with\n\nno assets")).toBe("Third week with no assets");
  });

  it("truncates over-budget text on a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim(); // 300 chars
    const out = reasoningPreview(long, 40)!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).not.toContain("wor…"); // cut at a space, not mid-word
  });

  it("keeps text exactly at the budget without an ellipsis", () => {
    const exact = "a".repeat(20);
    expect(reasoningPreview(exact, 20)).toBe(exact);
  });
});

describe("pagination", () => {
  const LEN = JOURNAL_PAGE_SIZE * 2 + 3;
  const rows: JournalRow[] = Array.from({ length: LEN }, (_, i) =>
    // Descending, always-valid timestamps so index 0 is newest → page 1 leads
    // with p00 (later index ⇒ earlier instant).
    row({
      id: `p${String(i).padStart(2, "0")}`,
      createdAt: new Date(Date.UTC(2026, 6, 1) + (LEN - i) * 60_000).toISOString(),
    }),
  );

  it("returns one page and reports hasMore while rows remain", () => {
    const p1 = runJournalQuery(rows, UID, 1);
    expect(p1.items).toHaveLength(JOURNAL_PAGE_SIZE);
    expect(p1.items[0].id).toBe("p00");
    expect(p1.hasMore).toBe(true);
  });

  it("advances pages and clears hasMore on the last partial page", () => {
    const p2 = runJournalQuery(rows, UID, 2);
    expect(p2.items).toHaveLength(JOURNAL_PAGE_SIZE);
    expect(p2.hasMore).toBe(true);
    const p3 = runJournalQuery(rows, UID, 3);
    expect(p3.items).toHaveLength(3);
    expect(p3.hasMore).toBe(false);
  });

  it("pages tile the full ordered set with no gaps or overlap", () => {
    const all = [1, 2, 3].flatMap((p) => runJournalQuery(rows, UID, p).items.map((i) => i.id));
    expect(all).toEqual(rows.map((r) => r.id)); // rows are already in newest-first id order
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("user scoping", () => {
  it("returns only the authenticated user's rows", () => {
    const mixed: JournalRow[] = [
      row({ id: "mine-1", createdAt: "2026-07-28T12:00:00Z", userId: UID }),
      row({ id: "theirs-1", createdAt: "2026-07-27T12:00:00Z", userId: "intruder" }),
      row({ id: "mine-2", createdAt: "2026-07-26T12:00:00Z", userId: UID }),
      row({ id: "theirs-2", createdAt: "2026-07-25T12:00:00Z", userId: "intruder" }),
    ];
    const { items } = runJournalQuery(mixed, UID, 1);
    expect(items.map((i) => i.id)).toEqual(["mine-1", "mine-2"]);
    expect(items.some((i) => i.id.startsWith("theirs"))).toBe(false);
  });

  it("scopes the restore window too", () => {
    const mixed: JournalRow[] = [
      row({ id: "mine", createdAt: "2026-07-28T12:00:00Z", userId: UID }),
      row({ id: "theirs", createdAt: "2026-07-27T12:00:00Z", userId: "intruder" }),
    ];
    const { items } = runJournalWindow(mixed, UID, 5);
    expect(items.map((i) => i.id)).toEqual(["mine"]);
  });
});

describe("restore round-trip: position preserved, annotation refreshed", () => {
  // Two pages of the current user's entries; the target entry E sits on page 2.
  const base: JournalRow[] = Array.from({ length: JOURNAL_PAGE_SIZE + 4 }, (_, i) =>
    row({ id: `e${String(i).padStart(2, "0")}`, createdAt: `2026-07-${String(28 - i).padStart(2, "0")}T12:00:00Z` }),
  );
  const targetId = `e${String(JOURNAL_PAGE_SIZE + 1).padStart(2, "0")}`; // second item on page 2

  it("shows the open annotation before resolving", () => {
    const before = runJournalWindow(base, UID, 2);
    const e = before.items.find((i) => i.id === targetId)!;
    expect(e.annotation.kind).toBe("open");
  });

  it("re-fetching the same 2-page window keeps E's position and updates its annotation", () => {
    const posBefore = runJournalWindow(base, UID, 2).items.findIndex((i) => i.id === targetId);

    // Simulate the resolve mutation on the stored row.
    const after = base.map((r) =>
      r.id === targetId ? { ...r, status: "resolved" as const, outcome: false, confidence: 0.75 } : r,
    );

    const restored = runJournalWindow(after, UID, 2);
    const posAfter = restored.items.findIndex((i) => i.id === targetId);
    const e = restored.items[posAfter];

    expect(posAfter).toBe(posBefore); // unchanged position (createdAt is stable)
    expect(e.annotation).toEqual({ kind: "resolved", outcome: false, brier: brierScore(0.75, false) });
    expect(restored.items).toHaveLength(JOURNAL_PAGE_SIZE + 4 > JOURNAL_PAGE_SIZE * 2 ? JOURNAL_PAGE_SIZE * 2 : JOURNAL_PAGE_SIZE + 4);
  });
});

describe("toJournalEntry", () => {
  it("carries id, createdAt, headline, preview, and annotation", () => {
    const entry = toJournalEntry(
      row({ id: "z", createdAt: "2026-07-28T12:00:00Z", reasoning: "  a  b  ", text: "Claim" }),
    );
    expect(entry).toMatchObject({ id: "z", headline: "Claim", preview: "a b" });
    expect(entry.annotation.kind).toBe("open");
  });

  it("headlines a forecast (decision null) with its claim text", () => {
    const entry = toJournalEntry(
      row({ id: "f", createdAt: "2026-07-28T12:00:00Z", decision: null, text: "The kitchen reno finishes by Aug 15" }),
    );
    expect(entry.headline).toBe("The kitchen reno finishes by Aug 15");
  });

  it("headlines a decision entry with the decision, not its success criterion", () => {
    const entry = toJournalEntry(
      row({
        id: "d",
        createdAt: "2026-07-28T12:00:00Z",
        decision: "I turn down the contract",
        text: "They come back with a better offer by Friday",
      }),
    );
    expect(entry.headline).toBe("I turn down the contract");
  });
});
