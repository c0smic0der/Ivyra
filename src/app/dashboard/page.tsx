import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { buildInsightsViewModel, type InsightsInput } from "@/lib/insights/insightsCore";
import { BIAS_UNLOCK_N } from "@/lib/scoring";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { Header } from "@/components/Header";
import { HowItWorksGate } from "@/components/HowItWorksGate";
import { InstallPrompt } from "./InstallPrompt";
import { OnboardingBanner } from "./OnboardingBanner";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards this route, but re-check so the type is narrowed
  // and the page is safe even if the matcher ever changes.
  if (!user) {
    redirect("/login");
  }

  const openPredictions = await db
    .select()
    .from(schema.predictions)
    .where(and(eq(schema.predictions.userId, user.id), eq(schema.predictions.status, "open")))
    .orderBy(asc(schema.predictions.resolutionDate));

  // Split on resolution_date ≤ today (the resolution_date column is a bare
  // date, so compare against today's UTC date string, not a Date instant).
  const todayIso = new Date().toISOString().slice(0, 10);
  const dueForResolution = openPredictions.filter((row) => row.resolutionDate <= todayIso);
  const upcoming = openPredictions.filter((row) => row.resolutionDate > todayIso);

  // Any prediction at all (open, resolved, or void) — drives the "true
  // zero-state" empty copy and gates the PWA install prompt.
  const [anyPredictionRow] = await db
    .select({ id: schema.predictions.id })
    .from(schema.predictions)
    .where(eq(schema.predictions.userId, user.id))
    .limit(1);
  const hasAnyPrediction = Boolean(anyPredictionRow);

  // Same view-model the insights page builds — the stats strip below is a
  // teaser of that page, not a parallel computation of its own.
  const resolvedRows = await db
    .select()
    .from(schema.predictions)
    .where(
      and(eq(schema.predictions.userId, user.id), inArray(schema.predictions.status, ["resolved", "void"])),
    )
    .orderBy(asc(schema.predictions.resolvedAt));

  const insightsInputs: InsightsInput[] = resolvedRows.map((row) => ({
    confidence: Number(row.confidence),
    outcome: row.outcome,
    status: row.status,
    resolvedAt: row.resolvedAt!,
    category: row.category,
    reasoningType: row.reasoningType,
  }));

  const vm = buildInsightsViewModel(insightsInputs, new Date());

  return (
    <>
      <Header />
      <HowItWorksGate />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Dashboard</h1>

          {/* Onboarding pointer — only while the account has no predictions. */}
          <OnboardingBanner hasAnyPrediction={hasAnyPrediction} />

          {/* Quick capture — fast on-ramp into the real capture flow, not a fork of it. */}
          <form action="/predictions/new" method="GET" className="mt-8 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              name="draft"
              required
              placeholder="What do you think will happen?"
              className={inputClasses("flex-1")}
            />
            <button type="submit" className={buttonVariants("primary")}>
              Log it →
            </button>
          </form>
          <Link href="/predictions/new" className="mt-2 inline-block text-xs text-ink-tertiary hover:underline">
            Prefer the full form?
          </Link>

          <InstallPrompt hasAnyPrediction={hasAnyPrediction} />

          {/* Stats strip — a teaser of the insights page, not a copy of it. */}
          <Card className="mt-8">
            {vm.n === 0 ? (
              <p className="text-sm text-ink-secondary">
                Resolve your first prediction to start tracking your calibration.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-ink">
                      {vm.runningBrier.value!.toFixed(2)}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-tertiary">Running Brier</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-ink">
                      {vm.bias.unlocked
                        ? `${vm.bias.value! >= 0 ? "+" : ""}${Math.round(vm.bias.value! * 100)}`
                        : `${vm.n}/${BIAS_UNLOCK_N}`}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-tertiary">Bias score</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold tabular-nums text-ink">{vm.n}</p>
                    <p className="mt-0.5 text-xs text-ink-tertiary">Resolved</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-ink-secondary">
                  {vm.bias.unlocked ? vm.bias.sentence : vm.bias.unlockSentence}
                </p>
              </>
            )}
            <Link href="/insights" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
              View insights →
            </Link>
          </Card>

          {/* Due for resolution — the primary return-visit driver; always shown. */}
          <section className="mt-12">
            <h2 className="text-base font-semibold text-ink">Due for resolution</h2>
            {dueForResolution.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {dueForResolution.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/predictions/${row.id}/resolve`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm transition-colors hover:border-warning/50"
                    >
                      <span className="min-w-0">
                        <span className="block text-ink">{row.text}</span>
                        <span className="mt-1 block text-xs text-ink-tertiary">
                          {Math.round(Number(row.confidence) * 100)}% · due {row.resolutionDate}
                        </span>
                      </span>
                      <span className={buttonVariants("primary", { size: "sm", className: "shrink-0" })}>
                        Resolve
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : upcoming.length > 0 ? (
              <p className="mt-3 text-sm text-ink-tertiary">
                Nothing due yet — your next resolution date is {upcoming[0]!.resolutionDate}.
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-tertiary">
                Nothing due — you&apos;ll be reminded here when a resolution date arrives.
              </p>
            )}
          </section>

          <section className="mt-12">
            <h2 className="text-base font-semibold text-ink">Open predictions</h2>
            {!hasAnyPrediction ? (
              <Card as="div" className="mt-3 border-dashed text-center text-sm text-ink-secondary">
                <p>Nothing here yet — every calibration curve starts with one prediction.</p>
                <Link href="/predictions/new" className="mt-2 inline-block font-medium text-accent hover:underline">
                  Log your first prediction
                </Link>
              </Card>
            ) : upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-ink-tertiary">
                {openPredictions.length > 0 ? (
                  "Nothing else open — resolve the ones above."
                ) : (
                  <>
                    Nothing open right now — see how you&apos;ve done in{" "}
                    <Link href="/insights" className="text-accent hover:underline">
                      Insights
                    </Link>
                    .
                  </>
                )}
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {upcoming.map((row) => (
                  <li key={row.id}>
                    <Card as="div" className="text-sm">
                      <p className="text-ink">{row.text}</p>
                      <p className="mt-1 text-xs text-ink-tertiary">
                        {Math.round(Number(row.confidence) * 100)}% · resolves {row.resolutionDate}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
