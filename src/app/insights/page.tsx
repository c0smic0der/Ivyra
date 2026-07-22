import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { buildInsightsViewModel, type BiasBreakdownRow, type InsightsInput } from "@/lib/insights/insightsCore";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { CalibrationChart } from "./CalibrationChart";
import { ProgressChart } from "./ProgressChart";

function LockStateCard({ sentence }: { sentence: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-ink-secondary">
      {sentence}
    </p>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: BiasBreakdownRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <CardLabel as="h3">{title}</CardLabel>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border-subtle">
              <td className="py-1.5 capitalize text-ink">{row.key.replace(/_/g, " ")}</td>
              <td className="whitespace-nowrap py-1.5 text-right text-ink-tertiary">n={row.n}</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-ink">
                {row.bias >= 0 ? "+" : ""}
                {Math.round(row.bias * 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await db
    .select()
    .from(schema.predictions)
    .where(
      and(eq(schema.predictions.userId, user.id), inArray(schema.predictions.status, ["resolved", "void"])),
    )
    .orderBy(asc(schema.predictions.resolvedAt));

  const inputs: InsightsInput[] = rows.map((row) => ({
    confidence: Number(row.confidence),
    outcome: row.outcome,
    status: row.status,
    resolvedAt: row.resolvedAt!,
    category: row.category,
    reasoningType: row.reasoningType,
  }));

  const vm = buildInsightsViewModel(inputs, new Date());

  return (
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Insights</h1>

          {vm.n === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-ink-secondary">
              <p className="font-medium text-ink">No resolutions yet</p>
              <p className="mt-1">
                Insights unlock as you resolve predictions — bias score at 10, progress trend at
                25, calibration curve at 30.
              </p>
              <Link href="/dashboard" className="mt-2 inline-block font-medium text-accent hover:underline">
                Go make a prediction →
              </Link>
            </div>
          )}

          {/* Bias score (with its by-category/reasoning breakdown columns) sits
              next to the calibration curve + progress trend, stacked together. */}
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Card>
              <CardLabel>Bias score</CardLabel>
              {vm.bias.unlocked ? (
                <>
                  <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">
                    {vm.bias.value! >= 0 ? "+" : ""}
                    {Math.round(vm.bias.value! * 100)}
                  </p>
                  <p className="mt-1 text-sm text-ink-secondary">{vm.bias.sentence}</p>
                  <BreakdownTable title="By category" rows={vm.bias.byCategory} />
                  <BreakdownTable title="By reasoning type" rows={vm.bias.byReasoningType} />
                </>
              ) : (
                <div className="mt-2">
                  <LockStateCard sentence={vm.bias.unlockSentence!} />
                </div>
              )}
            </Card>

            <div className="flex flex-col gap-8">
              <Card>
                <CardLabel>Calibration curve</CardLabel>
                <div className="mt-2">
                  {vm.curve.unlocked ? (
                    <CalibrationChart points={vm.curve.points} />
                  ) : (
                    <LockStateCard sentence={vm.curve.unlockSentence!} />
                  )}
                </div>
              </Card>

              <Card>
                <CardLabel>Progress (rolling Brier, last 20)</CardLabel>
                <div className="mt-2">
                  {vm.progress.unlocked ? (
                    <>
                      <ProgressChart trend={vm.progress.trend} baseline={vm.baselineBrier} />
                      {vm.progress.sentence && (
                        <p className="mt-1 text-sm text-ink-secondary">{vm.progress.sentence}</p>
                      )}
                    </>
                  ) : (
                    <LockStateCard sentence={vm.progress.unlockSentence!} />
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* Running Brier vs baseline */}
          <Card className="mt-8">
            <CardLabel>Running Brier</CardLabel>
            {vm.runningBrier.value !== null ? (
              <>
                <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">
                  {vm.runningBrier.value.toFixed(2)}
                </p>
                <p className="mt-1 text-sm text-ink-secondary">{vm.runningBrier.sentence}</p>
                <p className="mt-1 text-xs text-ink-tertiary">Baseline (always 50%): {vm.baselineBrier}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-secondary">No resolutions yet.</p>
            )}
          </Card>

          {/* Monthly summary */}
          <Card className="mt-8">
            <CardLabel>{vm.monthlySummary.periodLabel}</CardLabel>
            <p className="mt-2 text-sm text-ink-secondary">{vm.monthlySummary.paragraph}</p>
          </Card>
        </div>
      </main>
    </>
  );
}
