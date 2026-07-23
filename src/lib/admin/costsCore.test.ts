import { describe, expect, it } from "vitest";
import { buildCostsViewModel, type CostAggregateRow } from "@/lib/admin/costsCore";

function row(overrides: Partial<CostAggregateRow>): CostAggregateRow {
  return {
    day: "2026-07-01",
    purpose: "enrich",
    calls: 1,
    inputTokens: 100,
    outputTokens: 20,
    costUsd: "0.000200",
    ...overrides,
  };
}

describe("buildCostsViewModel", () => {
  it("empty set → zeroed totals, empty series, no NaN", () => {
    const vm = buildCostsViewModel([]);
    expect(vm.totals).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(vm.byDay).toEqual([]);
    expect(vm.byPurpose).toEqual([]);
    expect(JSON.stringify(vm)).not.toContain("NaN");
  });

  it("sums cost as numbers, not string concatenation", () => {
    const vm = buildCostsViewModel([
      row({ costUsd: "0.000100" }),
      row({ costUsd: "0.000200", purpose: "postmortem" }),
    ]);
    expect(vm.totals.costUsd).toBe(0.0003);
  });

  it("rounds to 6dp so float drift never leaks (0.1 + 0.2)", () => {
    const vm = buildCostsViewModel([
      row({ costUsd: "0.1" }),
      row({ costUsd: "0.2", purpose: "postmortem" }),
    ]);
    expect(vm.totals.costUsd).toBe(0.3);
  });

  it("single day, multiple purposes: byDay collapses purpose, byPurpose splits it", () => {
    const vm = buildCostsViewModel([
      row({ day: "2026-07-01", purpose: "enrich", calls: 2, costUsd: "0.000200" }),
      row({ day: "2026-07-01", purpose: "postmortem", calls: 1, costUsd: "0.000500" }),
    ]);
    expect(vm.byDay).toHaveLength(1);
    expect(vm.byDay[0]).toMatchObject({ day: "2026-07-01", calls: 3, costUsd: 0.0007 });
    expect(vm.byPurpose).toHaveLength(2);
    expect(vm.totals.calls).toBe(3);
  });

  it("multiple days, single purpose: byDay splits, byPurpose collapses; both sum to totals", () => {
    const vm = buildCostsViewModel([
      row({ day: "2026-07-01", costUsd: "0.000100" }),
      row({ day: "2026-07-02", costUsd: "0.000300" }),
      row({ day: "2026-07-03", costUsd: "0.000600" }),
    ]);
    expect(vm.byDay).toHaveLength(3);
    expect(vm.byPurpose).toHaveLength(1);
    const dayCostSum = vm.byDay.reduce((s, d) => s + d.costUsd, 0);
    expect(Math.round(dayCostSum * 1e6) / 1e6).toBe(vm.totals.costUsd);
    expect(vm.byPurpose[0].costUsd).toBe(vm.totals.costUsd);
  });

  it("byDay is ascending by ISO day regardless of input order", () => {
    const vm = buildCostsViewModel([
      row({ day: "2026-07-03" }),
      row({ day: "2026-07-01" }),
      row({ day: "2026-07-02" }),
    ]);
    expect(vm.byDay.map((d) => d.day)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });

  it("byPurpose is descending by cost, tie-broken by purpose asc (deterministic)", () => {
    const vm = buildCostsViewModel([
      row({ purpose: "enrich", costUsd: "0.000100" }),
      row({ purpose: "postmortem", costUsd: "0.000900" }),
      row({ purpose: "track_record_embed", costUsd: "0.000100" }),
    ]);
    expect(vm.byPurpose.map((p) => p.purpose)).toEqual([
      "postmortem", // highest cost
      "enrich", // tie 0.0001, "enrich" < "track_record_embed"
      "track_record_embed",
    ]);
  });

  it("token and call totals equal the sum of all rows", () => {
    const rows = [
      row({ inputTokens: 100, outputTokens: 20, calls: 1 }),
      row({ day: "2026-07-02", inputTokens: 250, outputTokens: 40, calls: 3 }),
    ];
    const vm = buildCostsViewModel(rows);
    expect(vm.totals.inputTokens).toBe(350);
    expect(vm.totals.outputTokens).toBe(60);
    expect(vm.totals.calls).toBe(4);
  });

  it("day×purpose grid: byDay and byPurpose each independently sum to totals", () => {
    const rows: CostAggregateRow[] = [
      row({ day: "2026-07-01", purpose: "enrich", costUsd: "0.000100", calls: 1 }),
      row({ day: "2026-07-01", purpose: "postmortem", costUsd: "0.000200", calls: 1 }),
      row({ day: "2026-07-02", purpose: "enrich", costUsd: "0.000300", calls: 1 }),
      row({ day: "2026-07-02", purpose: "postmortem", costUsd: "0.000400", calls: 1 }),
    ];
    const vm = buildCostsViewModel(rows);
    expect(vm.byDay).toHaveLength(2);
    expect(vm.byPurpose).toHaveLength(2);
    expect(vm.totals.costUsd).toBe(0.001);
    const sumDay = Math.round(vm.byDay.reduce((s, d) => s + d.costUsd, 0) * 1e6) / 1e6;
    const sumPurpose = Math.round(vm.byPurpose.reduce((s, p) => s + p.costUsd, 0) * 1e6) / 1e6;
    expect(sumDay).toBe(vm.totals.costUsd);
    expect(sumPurpose).toBe(vm.totals.costUsd);
  });
});
