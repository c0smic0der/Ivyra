import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { countAiCallsToday } from "@/lib/ai/enrich";
import { isValidScope, type InsightScope } from "@/lib/ai/scopedInsightCore";
import { buildInsightsViewModel, type InsightsInput } from "@/lib/insights/insightsCore";
import {
  buildScopedInsightCard,
  buildScopeStats,
  categoryMenu,
  type CachedInsight,
  type CategoryMenuItem,
  type InsightCardModel,
  type InsightPrediction,
} from "@/lib/insights/scopedInsightView";
import { queryFullHistory } from "@/lib/insights/historyQuery";
import { EMPTY_PARAMS, resolveFocusId } from "@/lib/insights/historyView";
import { buildVerdict } from "@/lib/insights/verdict";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { ResolutionHistory } from "@/components/ResolutionHistory";
import { InsightsOverview } from "./InsightsOverview";
import { InsightsSelectionProvider } from "./InsightsSelection";
import { ScopedInsight } from "./ScopedInsight";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ resolution?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?signin=1");

  const rawResolution = (await searchParams).resolution;
  const focusParam = typeof rawResolution === "string" ? rawResolution : null;

  // One user-scoped, RLS-guarded read of the full resolved/void history. It
  // powers the charts, the KPI strip, and the verdict (computed over the whole
  // record). The resolution-history LIST is fetched separately (below) as a
  // bounded, paged, server-side query — never the whole set shipped to the client.
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

  const vm = buildInsightsViewModel(inputs);

  // The scoped AI insight (replaces v1's templated monthly summary). Read
  // whatever is cached for each scope, then decide each card deterministically.
  // Nothing here calls the model; generation is on demand via the client action.
  const insightPreds: InsightPrediction[] = rows.map((row) => ({
    confidence: Number(row.confidence),
    outcome: row.outcome,
    status: row.status,
    category: row.category,
    reasoningType: row.reasoningType,
    text: row.text,
    reasoning: row.reasoning,
    outcomeNote: row.outcomeNote,
  }));

  // The headline verdict reads the code-assigned lifetime profile (the model
  // never re-decides it) plus the bias direction.
  const verdict = buildVerdict({
    n: vm.n,
    profile: buildScopeStats(insightPreds, "lifetime").profile,
    biasValue: vm.bias.value,
  });

  const catMenu: CategoryMenuItem[] = categoryMenu(insightPreds);
  const scopes: InsightScope[] = [
    "recent",
    "lifetime",
    ...catMenu.filter((o) => o.unlocked).map((o) => o.scope),
  ];

  const cachedRows = await db
    .select({
      scope: schema.insights.scope,
      bodyText: schema.insights.bodyText,
      nResolvedAtGeneration: schema.insights.nResolvedAtGeneration,
      promptVersion: schema.insights.promptVersion,
    })
    .from(schema.insights)
    .where(eq(schema.insights.userId, user.id));

  const cachedByScope = new Map<string, CachedInsight>();
  for (const r of cachedRows) {
    if (isValidScope(r.scope)) {
      cachedByScope.set(r.scope, {
        scope: r.scope,
        bodyText: r.bodyText,
        nResolvedAtGeneration: r.nResolvedAtGeneration,
        promptVersion: r.promptVersion,
      });
    }
  }

  const callsToday = await countAiCallsToday(user.id);
  const insightCards: InsightCardModel[] = scopes.map((scope) =>
    buildScopedInsightCard(
      buildScopeStats(insightPreds, scope),
      cachedByScope.get(scope) ?? null,
      callsToday,
    ),
  );

  // The resolution history's first page — filtered/sorted/paged on the server,
  // then handed to the shared component as its initial state. Every later
  // filter/sort/page change re-queries via the fetchHistory server action.
  const initialHistory = await queryFullHistory(user.id, EMPTY_PARAMS);
  // Whether the user has ANY resolved/void record (independent of the deep-link).
  const historyExists = rows.length > 0;

  // Deep link from a dashboard glance or an old detail-page URL:
  // /insights?resolution=<id> focuses that card. Enforce ownership here — only
  // pass the id through if it's one of THIS user's rows, so a foreign/opaque uuid
  // focuses nothing and reveals nothing.
  const focusId = resolveFocusId(
    rows.map((r) => r.id),
    focusParam,
  );

  return (
    <>
      <Header />
      <main className="page-gradient flex flex-1 justify-center px-6 py-8 lg:px-8">
        {/* Same container width as the dashboard, so the "Insights" title sits in
            the exact same spot as "Dashboard" when moving between the two pages. */}
        <div className="w-full max-w-5xl">
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

          <InsightsSelectionProvider>
            {/* Hero (verdict + KPIs) full width, then the focused chart and the AI
                insight side by side — filling the main row. */}
            <InsightsOverview
              verdict={verdict}
              n={vm.n}
              baseline={vm.baselineBrier}
              runningBrier={vm.runningBrier.value}
              bias={vm.bias}
              boldness={vm.boldness}
              curve={vm.curve}
              progress={vm.progress}
              insightSlot={
                <Card>
                  <ScopedInsight cards={insightCards} categoryMenu={catMenu} />
                </Card>
              }
            />

            {/* Resolution history — full width and large, at the bottom. */}
            <div className="mt-8">
              {historyExists ? (
                <ResolutionHistory mode="full" initial={initialHistory} focusId={focusId} />
              ) : (
                <section id="history" className="scroll-mt-6">
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
