// Pure view-model builder for the /admin/costs dashboard (docs §16 — the
// ai_calls cost/latency observability artifact). DB-free and unit-tested: the
// Server Component runs one grouped SQL aggregate over ai_calls and hands the
// raw rows here. Mirrors the insightsCore idiom (page does IO, core reshapes).
//
// `costUsd` arrives as a STRING (Postgres numeric via postgres-js), so every
// cost is parsed with Number() and re-rounded to 6dp — matching enrich.ts's
// costFor().toFixed(6) — to kill float drift and any NaN leak.

import type { AiCallPurpose } from "@/lib/ai/enrich";

export type { AiCallPurpose };

/** One row per (day, purpose) straight from the aggregate query. */
export interface CostAggregateRow {
  day: string; // "YYYY-MM-DD" (UTC)
  purpose: AiCallPurpose;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string; // numeric-as-string; parse before use
}

export interface CostTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CostDayPoint {
  day: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CostPurposeRow {
  purpose: AiCallPurpose;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface CostsViewModel {
  totals: CostTotals;
  /** Ascending by ISO day — ready for a Recharts X axis (dataKey="day"). */
  byDay: CostDayPoint[];
  /** Descending by cost, tie-broken by purpose asc — deterministic. */
  byPurpose: CostPurposeRow[];
}

/** Round to 6 decimal places, matching costFor()'s .toFixed(6) in enrich.ts. */
function roundUsd(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function buildCostsViewModel(rows: CostAggregateRow[]): CostsViewModel {
  const totals: CostTotals = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  const dayMap = new Map<string, CostDayPoint>();
  const purposeMap = new Map<AiCallPurpose, CostPurposeRow>();

  for (const row of rows) {
    const cost = Number(row.costUsd) || 0;

    totals.calls += row.calls;
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.costUsd += cost;

    const day = dayMap.get(row.day) ?? {
      day: row.day,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    day.calls += row.calls;
    day.inputTokens += row.inputTokens;
    day.outputTokens += row.outputTokens;
    day.costUsd += cost;
    dayMap.set(row.day, day);

    const purpose = purposeMap.get(row.purpose) ?? {
      purpose: row.purpose,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    purpose.calls += row.calls;
    purpose.inputTokens += row.inputTokens;
    purpose.outputTokens += row.outputTokens;
    purpose.costUsd += cost;
    purposeMap.set(row.purpose, purpose);
  }

  totals.costUsd = roundUsd(totals.costUsd);

  const byDay = [...dayMap.values()]
    .map((d) => ({ ...d, costUsd: roundUsd(d.costUsd) }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const byPurpose = [...purposeMap.values()]
    .map((p) => ({ ...p, costUsd: roundUsd(p.costUsd) }))
    .sort((a, b) => b.costUsd - a.costUsd || a.purpose.localeCompare(b.purpose));

  return { totals, byDay, byPurpose };
}
