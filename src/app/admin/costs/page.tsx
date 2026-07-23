import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { buildCostsViewModel, type AiCallPurpose, type CostAggregateRow } from "@/lib/admin/costsCore";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { CostChart } from "./CostChart";

// AI cost/observability dashboard off the ai_calls table (docs §16). Owner-only:
// gated by ADMIN_USER_ID, checked BEFORE any query runs. A non-admin, a logged-
// out visitor, and a genuinely missing route ALL hit notFound() → the same
// not-found.tsx (identical 404 status + body), so the admin surface is
// indistinguishable and there's no fetch-then-filter timing tell.
export const dynamic = "force-dynamic";

function PurposeLabel({ purpose }: { purpose: AiCallPurpose }) {
  return <span className="capitalize">{purpose.replace(/_/g, " ")}</span>;
}

export default async function AdminCostsPage() {
  const adminUserId = process.env.ADMIN_USER_ID;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Gate first — never query cost data for a non-admin.
  if (!adminUserId || !user || user.id !== adminUserId) {
    notFound();
  }

  // One grouped aggregate over ai_calls. cost_usd is a numeric column returned
  // as a string, so sum(cost_usd::numeric) forces server-side numeric summation
  // (not JS string concat); ::text returns a parseable string to costsCore.
  const rawRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${schema.aiCalls.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      purpose: schema.aiCalls.purpose,
      calls: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.aiCalls.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.aiCalls.outputTokens}), 0)::int`,
      costUsd: sql<string>`coalesce(sum(${schema.aiCalls.costUsd}::numeric), 0)::text`,
    })
    .from(schema.aiCalls)
    .groupBy(sql`1`, schema.aiCalls.purpose)
    .orderBy(sql`1`);

  const rows: CostAggregateRow[] = rawRows.map((r) => ({
    ...r,
    purpose: r.purpose as AiCallPurpose,
  }));
  const vm = buildCostsViewModel(rows);

  const numberFmt = new Intl.NumberFormat("en-US");

  return (
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">AI costs</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Every Anthropic call is logged to <code>ai_calls</code> with tokens, cost, and latency.
          </p>

          {/* KPI row */}
          <Card className="mt-8">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  ${vm.totals.costUsd.toFixed(4)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">Total cost</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {numberFmt.format(vm.totals.calls)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">Calls</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {numberFmt.format(vm.totals.inputTokens)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">Input tokens</p>
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums text-ink">
                  {numberFmt.format(vm.totals.outputTokens)}
                </p>
                <p className="mt-0.5 text-xs text-ink-tertiary">Output tokens</p>
              </div>
            </div>
          </Card>

          {/* Cost over time */}
          <Card className="mt-8">
            <CardLabel>Cost per day</CardLabel>
            <div className="mt-2">
              {vm.byDay.length > 0 ? (
                <CostChart byDay={vm.byDay} />
              ) : (
                <p className="rounded-xl border border-dashed border-border p-4 text-sm text-ink-secondary">
                  No AI calls logged yet.
                </p>
              )}
            </div>
          </Card>

          {/* By purpose */}
          <Card className="mt-8">
            <CardLabel>By purpose</CardLabel>
            {vm.byPurpose.length > 0 ? (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-ink-tertiary">
                    <th className="py-1.5 text-left font-medium">Purpose</th>
                    <th className="py-1.5 text-right font-medium">Calls</th>
                    <th className="py-1.5 text-right font-medium">In</th>
                    <th className="py-1.5 text-right font-medium">Out</th>
                    <th className="py-1.5 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {vm.byPurpose.map((r) => (
                    <tr key={r.purpose} className="border-t border-border-subtle">
                      <td className="py-1.5 text-ink">
                        <PurposeLabel purpose={r.purpose} />
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ink-secondary">
                        {numberFmt.format(r.calls)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ink-secondary">
                        {numberFmt.format(r.inputTokens)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ink-secondary">
                        {numberFmt.format(r.outputTokens)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ink">
                        ${r.costUsd.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-sm text-ink-secondary">No AI calls logged yet.</p>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
