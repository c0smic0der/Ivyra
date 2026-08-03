import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/requireUser";
import { queryJournal, queryJournalTimestamps } from "@/lib/journal/journalQuery";
import { isDue } from "@/lib/journal/journalView";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { HowItWorksGate } from "@/components/HowItWorksGate";
import { InstallPrompt } from "./InstallPrompt";
import { OnboardingBanner } from "./OnboardingBanner";
import { JournalTimeline } from "./JournalTimeline";
import { QuickCapture } from "./QuickCapture";
import { ResolveQueue, type QueueItem } from "./ResolveQueue";

// The home: the journal timeline (docs/04-journal-reframe §3.2) with the resolve
// queue — the due-for-resolution and open-but-not-due lists — beside it. This
// Server Component owns every read: it authenticates, scopes each query to the
// user, and hands scored, serializable data to the client. No scoring math runs
// in a component — timeline annotations come from the scoring module.
export default async function DashboardPage() {
  const user = await requireUser();

  const todayIso = new Date().toISOString().slice(0, 10);
  const [firstPage, openRows, allTimestamps] = await Promise.all([
    queryJournal(user.id, 1),
    db
      .select({
        id: schema.predictions.id,
        text: schema.predictions.text,
        confidence: schema.predictions.confidence,
        resolutionDate: schema.predictions.resolutionDate,
      })
      .from(schema.predictions)
      .where(and(eq(schema.predictions.userId, user.id), eq(schema.predictions.status, "open")))
      .orderBy(asc(schema.predictions.resolutionDate)),
    queryJournalTimestamps(user.id),
  ]);

  const hasAnyEntry = firstPage.items.length > 0;

  // Split open entries on resolution_date ≤ today (bare date, UTC compare).
  const toItem = (r: (typeof openRows)[number]): QueueItem => ({
    id: r.id,
    text: r.text,
    confidencePercent: Math.round(Number(r.confidence) * 100),
    resolutionDate: r.resolutionDate,
  });
  const due = openRows.filter((r) => isDue(r.resolutionDate, todayIso)).map(toItem);
  const upcoming = openRows.filter((r) => !isDue(r.resolutionDate, todayIso)).map(toItem);

  return (
    <>
      <Header />
      <HowItWorksGate />
      <main className="page-gradient flex flex-1 justify-center px-6 py-8 lg:px-8">
        <div className="w-full max-w-6xl">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Your journal</h1>

          {/* Onboarding pointer — only while the account has no entries. */}
          <OnboardingBanner hasAnyPrediction={hasAnyEntry} />

          {/* Quick capture — a fast on-ramp into the real capture flow, not a fork.
              The draft is handed off via sessionStorage, never the URL. */}
          <QuickCapture />
          <Link
            href="/predictions/new"
            className="mt-2 ml-3 inline-block text-xs text-ink-tertiary hover:underline"
          >
            Prefer the full form?
          </Link>

          <InstallPrompt hasAnyPrediction={hasAnyEntry} />

          {/* Timeline (main) with the resolve queue beside it. */}
          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              {hasAnyEntry ? (
                <JournalTimeline initial={firstPage} todayIso={todayIso} allTimestamps={allTimestamps} />
              ) : (
                <Card as="div" className="border-dashed text-center text-sm text-ink-secondary">
                  <p>Your journal is empty — every calibration curve starts with one entry.</p>
                  <Link
                    href="/predictions/new"
                    className="mt-2 inline-block font-medium text-accent hover:underline"
                  >
                    Write your first entry
                  </Link>
                </Card>
              )}
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <ResolveQueue due={due} upcoming={upcoming} />
            </aside>
          </div>

          {/* Where the numbers live — the timeline reads; interpretation is on /insights. */}
          <p className="mt-10 text-center text-sm text-ink-tertiary">
            See your calibration in{" "}
            <Link href="/insights" className="text-accent hover:underline">
              Insights
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
