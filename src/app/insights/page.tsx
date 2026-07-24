import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import {
  buildInsightsViewModel,
  type BiasBreakdownRow,
  type InsightsInput,
  type InsightsViewModel,
} from "@/lib/insights/insightsCore";
import { HISTORY_CATEGORIES, type HistoryItem } from "@/lib/insights/historyView";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { CalibrationChart } from "./CalibrationChart";
import { InsightsSelectionProvider } from "./InsightsSelection";
import { ProgressChart } from "./ProgressChart";
import { ResolutionHistory } from "./ResolutionHistory";

function LockStateCard({ sentence }: { sentence: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-ink-secondary">
      {sentence}
    </p>
  );
}

/**
 * The Boldness gauge: the 0–1 value, a fill bar (same track pattern the landing
 * page uses), its directional sentence, and a plain-English "what does this
 * mean?" line. Every number arrives pre-computed on `vm.boldness` — the
 * component does no math, only presents it.
 */
function BoldnessGauge({ boldness }: { boldness: InsightsViewModel["boldness"] }) {
  if (!boldness.unlocked) {
    return (
      <div className="mt-2">
        <LockStateCard sentence={boldness.unlockSentence!} />
      </div>
    );
  }

  // Unlocked but not yet readable (no outcome variety): narrate, no number/bar.
  if (boldness.value === null) {
    return <p className="mt-2 text-sm text-ink-secondary">{boldness.sentence}</p>;
  }

  const fill = Math.round(boldness.value * 100);
  return (
    <>
      <p className="mt-2 text-5xl font-semibold tabular-nums text-ink">{boldness.value.toFixed(2)}</p>
      <div className="mt-3 h-2 rounded-full bg-surface" role="presentation">
        <div className="h-full rounded-full bg-accent" style={{ width: `${fill}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
        <span>Hedging</span>
        <span>Informative</span>
      </div>
      <p className="mt-3 text-sm text-ink-secondary">{boldness.sentence}</p>
      <p className="mt-2 text-xs text-ink-tertiary">
        Boldness runs 0–1: how much your confidence levels separate what comes true from what
        doesn&apos;t. Near 0 means you cluster around 50/50; near 1 means you commit — and are right
        to.
      </p>
    </>
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
  if (!user) redirect("/?signin=1");

  // One user-scoped, RLS-guarded read of the full resolved/void history. It
  // powers both the charts (computed over the whole record) and the resolution
  // history list (filtered/sorted/paged live in the browser — the user's own
  // bounded data, never another user's rows).
  const rows = await db
    .select()
    .from(schema.predictions)
    .where(
      and(eq(schema.predictions.userId, user.id), inArray(schema.predictions.status, ["resolved", "void"])),
    )
    .orderBy(asc(schema.predictions.resolvedAt));

  const inputs: InsightsInput[] = rows.map((row) => ({
    id: row.id,
    text: row.text,
    confidence: Number(row.confidence),
    outcome: row.outcome,
    status: row.status,
    resolvedAt: row.resolvedAt!,
    category: row.category,
    reasoningType: row.reasoningType,
  }));

  const vm = buildInsightsViewModel(inputs, new Date());

  const historyItems: HistoryItem[] = rows.map((row) => ({
    id: row.id,
    text: row.text,
    confidence: Number(row.confidence),
    outcome: row.outcome,
    status: row.status as "resolved" | "void",
    category: row.category,
    brier: row.brierScore === null ? null : Number(row.brierScore),
    resolvedAt: row.resolvedAt!.toISOString(),
  }));
  const historyExists = historyItems.length > 0;

  return (
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-6xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Insights</h1>

          {vm.n === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-ink-secondary">
              <p className="font-medium text-ink">No resolutions yet</p>
              <p className="mt-1">
                Insights unlock as you resolve predictions — bias score at 10, progress trend at
                25, calibration curve and boldness at 30.
              </p>
              <Link href="/dashboard" className="mt-2 inline-block font-medium text-accent hover:underline">
                Go make a prediction →
              </Link>
            </div>
          )}

          {/* The progress chart and the resolution history share a live
              selection (via context), so clicking/dragging on the chart filters
              the list beside it with no navigation. */}
          <InsightsSelectionProvider>
            <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
              {/* LEFT — analytics: headline stats + the two charts. */}
              <div className="flex flex-col gap-8 lg:col-span-7">
                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                  <Card>
                    <CardLabel>Running Brier</CardLabel>
                    {vm.runningBrier.value !== null ? (
                      <>
                        <p className="mt-2 text-5xl font-semibold tabular-nums text-ink">
                          {vm.runningBrier.value.toFixed(2)}
                        </p>
                        <p className="mt-2 text-sm text-ink-secondary">{vm.runningBrier.sentence}</p>
                        <p className="mt-2 text-xs text-ink-tertiary">
                          Baseline (always 50%): {vm.baselineBrier}
                        </p>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-ink-secondary">No resolutions yet.</p>
                    )}
                  </Card>

                  <Card>
                    <CardLabel>Bias score</CardLabel>
                    {vm.bias.unlocked ? (
                      <>
                        <p className="mt-2 text-5xl font-semibold tabular-nums text-ink">
                          {vm.bias.value! >= 0 ? "+" : ""}
                          {Math.round(vm.bias.value! * 100)}
                        </p>
                        <p className="mt-2 text-sm text-ink-secondary">{vm.bias.sentence}</p>
                      </>
                    ) : (
                      <div className="mt-2">
                        <LockStateCard sentence={vm.bias.unlockSentence!} />
                      </div>
                    )}
                  </Card>
                </div>

                <Card>
                  <CardLabel>Boldness</CardLabel>
                  <BoldnessGauge boldness={vm.boldness} />
                </Card>

                {vm.bias.unlocked &&
                  (vm.bias.byCategory.length > 0 || vm.bias.byReasoningType.length > 0) && (
                    <Card>
                      <CardLabel>Bias breakdown</CardLabel>
                      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                        <BreakdownTable title="By category" rows={vm.bias.byCategory} />
                        <BreakdownTable title="By reasoning type" rows={vm.bias.byReasoningType} />
                      </div>
                    </Card>
                  )}

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
                  <CardLabel>Progress (Brier over time)</CardLabel>
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

                <Card>
                  <CardLabel>{vm.monthlySummary.periodLabel}</CardLabel>
                  <p className="mt-2 text-sm text-ink-secondary">{vm.monthlySummary.paragraph}</p>
                </Card>
              </div>

              {/* RIGHT — resolution history: live filter/sort/paginate + chart selection. */}
              {historyExists ? (
                <ResolutionHistory items={historyItems} categories={HISTORY_CATEGORIES} />
              ) : (
                <section id="history" className="scroll-mt-6 lg:col-span-5">
                  <h2 className="text-base font-semibold text-ink">Resolution history</h2>
                  <Card as="div" className="mt-3 border-dashed text-center text-sm text-ink-secondary">
                    <p>Your resolved predictions will appear here as you resolve them.</p>
                  </Card>
                </section>
              )}
            </div>
          </InsightsSelectionProvider>
        </div>
      </main>
    </>
  );
}
