import { describe, expect, it } from "vitest";

// Concurrency contract for the reminders idempotency claim.
//
// The production claim is `claimDueReminders` (query.ts): a single
// `UPDATE ... WHERE reminded_at IS NULL ... RETURNING` with `FOR UPDATE SKIP
// LOCKED`, which marks and returns due rows in ONE statement so a returned row
// is claimed by exactly one invocation. The route then emails precisely the
// returned rows. That atomicity is a Postgres guarantee; a DB-free unit test
// can't drive real row locks, so here we model the two implementations and
// assert the PROPERTY the fix upholds: two overlapping cron runs email each due
// row exactly once. The "racy" model (read unmarked rows, await, then mark —
// the old findPredictionsDueToday + markReminded pair) is included to prove the
// test has teeth: it double-sends, and the atomic model doesn't.

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface DueRow {
  id: string;
  userId: string;
}

/**
 * Atomic claim: selects the currently-unclaimed rows and marks them in a single
 * JS tick with NO await between selection and marking — modeling the one-shot
 * UPDATE...RETURNING under SKIP LOCKED. Concurrent callers therefore claim
 * DISJOINT sets (the second sees the first's marks already applied).
 */
function makeAtomicClaimer(rows: DueRow[]) {
  const claimed = new Set<string>();
  return async function claim(): Promise<DueRow[]> {
    await tick(); // the round-trip to Postgres — the ONLY await
    // --- indivisible critical section (no await inside) ---
    const mine = rows.filter((r) => !claimed.has(r.id));
    for (const r of mine) claimed.add(r.id);
    return mine;
  };
}

/**
 * Racy claim: reads the unclaimed rows, awaits (yields), THEN marks — the
 * read-then-write window the fix removes. Overlapping callers read the same
 * unmarked set and both return it.
 */
function makeRacyClaimer(rows: DueRow[]) {
  const claimed = new Set<string>();
  return async function claim(): Promise<DueRow[]> {
    const mine = rows.filter((r) => !claimed.has(r.id)); // read
    await tick(); // window: the other run reads the same unmarked set here
    for (const r of mine) claimed.add(r.id); // mark
    return mine;
  };
}

/** Models the route: email each claimed row once, tallying sends per row. */
function runRoute(claimed: DueRow[], sends: Map<string, number>) {
  for (const row of claimed) {
    sends.set(row.id, (sends.get(row.id) ?? 0) + 1);
  }
}

const DUE: DueRow[] = [
  { id: "p1", userId: "u1" },
  { id: "p2", userId: "u1" },
  { id: "p3", userId: "u2" },
];

describe("reminder claim — concurrency contract", () => {
  it("emails each due row exactly once across two overlapping runs", async () => {
    const claim = makeAtomicClaimer(DUE);
    const sends = new Map<string, number>();

    // Two cron invocations racing in the same window.
    const [a, b] = await Promise.all([claim(), claim()]);
    runRoute(a, sends);
    runRoute(b, sends);

    // Every row sent, none sent twice.
    expect(new Set([...a, ...b].map((r) => r.id))).toEqual(new Set(["p1", "p2", "p3"]));
    for (const row of DUE) expect(sends.get(row.id)).toBe(1);
    // The two runs partitioned the rows — no overlap.
    expect(a.some((r) => b.some((o) => o.id === r.id))).toBe(false);
  });

  it("a second run after the first has claimed sends nothing (idempotent)", async () => {
    const claim = makeAtomicClaimer(DUE);
    const first = await claim();
    const second = await claim();
    expect(first).toHaveLength(3);
    expect(second).toEqual([]);
  });

  it("(teeth) the old read-then-write pattern DOES double-send — the bug the atomic claim fixes", async () => {
    const claim = makeRacyClaimer(DUE);
    const sends = new Map<string, number>();

    const [a, b] = await Promise.all([claim(), claim()]);
    runRoute(a, sends);
    runRoute(b, sends);

    // Both runs read the same unmarked set during the await window, so every row
    // is emailed twice — the duplicate-send the claim-in-one-statement prevents.
    for (const row of DUE) expect(sends.get(row.id)).toBe(2);
  });
});
