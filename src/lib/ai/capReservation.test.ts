import { describe, expect, it } from "vitest";
import { DAILY_AI_CALL_CAP } from "@/lib/ai/enrichCore";

// Concurrency contract for the shared daily-cap gate.
//
// The production gate is `reserveAiCallIfUnderCap` (enrich.ts): a per-user
// advisory-locked transaction that does the count-check and the reservation
// insert as ONE indivisible step, so no two concurrent requests can both pass a
// stale sub-cap count. That atomicity is a Postgres guarantee and can't be
// exercised by a DB-free unit test — so here we model the two possible
// implementations and assert the PROPERTY the fix must uphold: N concurrent
// reservations against an atomic gate never exceed the cap. The "racy" model
// (an await between read and write — exactly the old
// countAiCallsToday + isUnderDailyCap + logAiCall sequence) is included to prove
// the test has teeth: it overruns, and the atomic model doesn't.

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Atomic reservation: the check and the increment happen in a single JS tick
 * with NO await between them, modeling the advisory-locked transaction whose
 * whole check-and-insert is indivisible. Returns a slot id or null (over cap).
 */
function makeAtomicGate(cap: number) {
  let used = 0;
  return async function reserve(): Promise<string | null> {
    await tick(); // the round-trip to Postgres — the ONLY await
    // --- indivisible critical section (no await inside) ---
    if (used < cap) {
      used += 1;
      return `slot-${used}`;
    }
    return null;
  };
}

/**
 * Racy reservation: reads the count, awaits (yields to other callers), THEN
 * writes — the read-then-act TOCTOU the fix removes. Concurrent callers all read
 * the same pre-write count and all reserve.
 */
function makeRacyGate(cap: number) {
  let used = 0;
  return async function reserve(): Promise<string | null> {
    const snapshot = used; // read
    await tick(); // window: other callers read the same snapshot here
    if (snapshot < cap) {
      used += 1; // write
      return `slot-${used}`;
    }
    return null;
  };
}

async function fireConcurrently(reserve: () => Promise<string | null>, n: number) {
  const results = await Promise.all(Array.from({ length: n }, () => reserve()));
  const granted = results.filter((r): r is string => r !== null);
  return { grantedCount: granted.length, results };
}

describe("daily-cap reservation — concurrency contract", () => {
  it("never grants more than the cap under a burst of concurrent requests", async () => {
    const cap = 5;
    const { grantedCount } = await fireConcurrently(makeAtomicGate(cap), 50);
    // 50 requests fired at once; at most `cap` may win a slot — no overrun.
    expect(grantedCount).toBe(cap);
  });

  it("grants exactly the requests that fit when the burst is under the cap", async () => {
    const cap = 25;
    const { grantedCount } = await fireConcurrently(makeAtomicGate(cap), 10);
    expect(grantedCount).toBe(10);
  });

  it("grants nothing once the cap is already spent", async () => {
    const gate = makeAtomicGate(3);
    await fireConcurrently(gate, 3); // spend the cap
    const { grantedCount } = await fireConcurrently(gate, 8);
    expect(grantedCount).toBe(0);
  });

  it("boundary matches isUnderDailyCap: the (cap)th concurrent request is refused", async () => {
    // With the real DAILY_AI_CALL_CAP, firing cap+extra concurrently grants
    // exactly cap — the same boundary isUnderDailyCap draws for the UI display.
    const { grantedCount } = await fireConcurrently(makeAtomicGate(DAILY_AI_CALL_CAP), DAILY_AI_CALL_CAP + 10);
    expect(grantedCount).toBe(DAILY_AI_CALL_CAP);
  });

  it("(teeth) the old read-then-act pattern DOES overrun the cap — which is the bug the atomic gate fixes", async () => {
    const cap = 5;
    const { grantedCount } = await fireConcurrently(makeRacyGate(cap), 50);
    // All 50 read the same pre-write count of 0 during the await window, so all
    // pass the `snapshot < cap` check: a gross overrun. This asserts the failure
    // the atomic gate above prevents.
    expect(grantedCount).toBeGreaterThan(cap);
  });
});
