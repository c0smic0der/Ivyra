// Shared scoring test fixtures.
//
// These are consumed by decompose.test.ts today and are intended to be the ONE
// copy the v3 Wilson-interval and windowed-Murphy suites reuse — same shapes,
// no divergent inline copies that drift apart. Not a `*.test.ts` file, so vitest
// does not collect it; it only exports data + builders.
//
// The single-valued fixtures (one confidence per occupied decile) exist so the
// textbook identity `brier = uncertainty − resolution + reliability` holds to
// float tolerance. See decompose.test.ts for the mixed-bucket counterpart that
// exercises the within-bin-variance residual (the normal case for real data).

import type { Scorable } from "@/lib/scoring";

/** Terse Scorable builder. A non-null outcome with no status ⇒ resolved. */
export const p = (
  confidence: number,
  outcome: boolean | null,
  status?: Scorable["status"],
): Scorable => ({ confidence, outcome, status });

/** `total` predictions at one confidence, the first `yes` of them YES. */
export const yesNo = (confidence: number, yes: number, total: number): Scorable[] =>
  Array.from({ length: total }, (_, i) => p(confidence, i < yes));

// 12 resolved predictions across four single-valued buckets. A void and a
// still-open row are interleaved to prove exclusion flows through resolvedNonVoid.
//   bucket 2 (0.25): 3 preds, 1 YES → freq 1/3
//   bucket 5 (0.55): 3 preds, 2 YES → freq 2/3
//   bucket 7 (0.75): 4 preds, 3 YES → freq 3/4
//   bucket 9 (0.95): 2 preds, 2 YES → freq 1
export const FIXTURE_12: Scorable[] = [
  p(0.25, true), p(0.25, false), p(0.25, false),
  p(0.99, null, "void"),
  p(0.55, true), p(0.55, true), p(0.55, false),
  p(0.5, null, "open"),
  p(0.75, true), p(0.75, true), p(0.75, true), p(0.75, false),
  p(0.95, true), p(0.95, true),
];

// 40 resolved predictions across six single-valued buckets (≥ CURVE_UNLOCK_N,
// so this fixture also exercises boldness). Counts chosen so hit rates are exact
// fractions and no bucket mixes confidences.
//   bucket 1 (0.15):  4 preds, 0 YES → freq 0
//   bucket 3 (0.35):  6 preds, 2 YES → freq 1/3
//   bucket 5 (0.55):  8 preds, 4 YES → freq 1/2
//   bucket 6 (0.65):  6 preds, 5 YES → freq 5/6
//   bucket 8 (0.85): 10 preds, 8 YES → freq 4/5
//   bucket 9 (0.95):  6 preds, 6 YES → freq 1
export const FIXTURE_40: Scorable[] = [
  ...yesNo(0.15, 0, 4),
  ...yesNo(0.35, 2, 6),
  ...yesNo(0.55, 4, 8),
  ...yesNo(0.65, 5, 6),
  ...yesNo(0.85, 8, 10),
  ...yesNo(0.95, 6, 6),
];
