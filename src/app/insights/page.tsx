import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { buildInsightsViewModel, type BiasBreakdownRow, type InsightsInput } from "@/lib/insights/insightsCore";
import { createClient } from "@/lib/supabase/server";
import { CalibrationChart } from "./CalibrationChart";
import { ProgressChart } from "./ProgressChart";

function LockStateCard({ sentence }: { sentence: string }) {
  return (
    <p className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
      {sentence}
    </p>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: BiasBreakdownRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</h3>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-zinc-100 dark:border-zinc-800">
              <td className="py-1.5 capitalize">{row.key.replace(/_/g, " ")}</td>
              <td className="py-1.5 text-right text-zinc-500">n={row.n}</td>
              <td className="py-1.5 text-right tabular-nums">
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
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-md">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          ← Dashboard
        </Link>

        <h1 className="mt-4 text-2xl font-semibold">Insights</h1>

        {/* Bias score */}
        <section className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Bias score</h2>
          {vm.bias.unlocked ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {vm.bias.value! >= 0 ? "+" : ""}
                {Math.round(vm.bias.value! * 100)}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{vm.bias.sentence}</p>
              <BreakdownTable title="By category" rows={vm.bias.byCategory} />
              <BreakdownTable title="By reasoning type" rows={vm.bias.byReasoningType} />
            </>
          ) : (
            <div className="mt-2">
              <LockStateCard sentence={vm.bias.unlockSentence!} />
            </div>
          )}
        </section>

        {/* Calibration curve */}
        <section className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Calibration curve
          </h2>
          <div className="mt-2">
            {vm.curve.unlocked ? (
              <CalibrationChart points={vm.curve.points} />
            ) : (
              <LockStateCard sentence={vm.curve.unlockSentence!} />
            )}
          </div>
        </section>

        {/* Progress chart */}
        <section className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Progress (rolling Brier, last 20)
          </h2>
          <div className="mt-2">
            {vm.progress.unlocked ? (
              <>
                <ProgressChart trend={vm.progress.trend} baseline={vm.baselineBrier} />
                {vm.progress.sentence && (
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {vm.progress.sentence}
                  </p>
                )}
              </>
            ) : (
              <LockStateCard sentence={vm.progress.unlockSentence!} />
            )}
          </div>
        </section>

        {/* Running Brier vs baseline */}
        <section className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Running Brier
          </h2>
          {vm.runningBrier.value !== null ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {vm.runningBrier.value.toFixed(2)}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {vm.runningBrier.sentence}
              </p>
              <p className="mt-1 text-xs text-zinc-400">Baseline (always 50%): {vm.baselineBrier}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">No resolutions yet.</p>
          )}
        </section>

        {/* Monthly summary */}
        <section className="mt-6 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            {vm.monthlySummary.periodLabel}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {vm.monthlySummary.paragraph}
          </p>
        </section>
      </div>
    </main>
  );
}
