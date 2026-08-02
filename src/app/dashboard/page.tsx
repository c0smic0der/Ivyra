import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { countDueForResolution, queryJournal } from "@/lib/journal/journalQuery";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { HowItWorksGate } from "@/components/HowItWorksGate";
import { InstallPrompt } from "./InstallPrompt";
import { OnboardingBanner } from "./OnboardingBanner";
import { ResolveStrip } from "./ResolveStrip";
import { JournalTimeline } from "./JournalTimeline";
import { QuickCapture } from "./QuickCapture";

// The home is a reverse-chronological journal timeline (docs/04-journal-reframe
// §3.2). This Server Component owns every read: it authenticates, scopes the
// query to the user, orders newest-first, pages, and hands a scored,
// serializable view model to the client. No scoring math runs in a component —
// the annotations come from the scoring module via journalView. The old
// dashboard's open/due lists are demoted to /dashboard/queue, reachable through
// the resolve strip below; nothing is deleted.
export default async function DashboardPage() {
  const user = await requireUser();

  const todayIso = new Date().toISOString().slice(0, 10);
  const [firstPage, dueCount] = await Promise.all([
    queryJournal(user.id, 1),
    countDueForResolution(user.id, todayIso),
  ]);

  const hasAnyEntry = firstPage.items.length > 0;

  return (
    <>
      <Header />
      <HowItWorksGate />
      <main className="page-gradient flex flex-1 justify-center px-6 py-8 lg:px-8">
        <div className="w-full max-w-2xl">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Your journal</h1>
            <Link href="/predictions/new" className={buttonVariants("primary", { size: "sm" })}>
              New entry
            </Link>
          </div>

          {/* Onboarding pointer — only while the account has no entries. */}
          <OnboardingBanner hasAnyPrediction={hasAnyEntry} />

          {/* The due-for-resolution function, reduced to one dismissible strip. */}
          <ResolveStrip count={dueCount} />

          {/* Quick capture — a fast on-ramp into the real capture flow, not a fork.
              The draft is handed off via sessionStorage, never the URL. */}
          <QuickCapture />

          <InstallPrompt hasAnyPrediction={hasAnyEntry} />

          {/* The timeline. */}
          <div className="mt-10">
            {hasAnyEntry ? (
              <JournalTimeline initial={firstPage} />
            ) : (
              <Card as="div" className="border-dashed text-center text-sm text-ink-secondary">
                <p>Your journal is empty — every calibration curve starts with one entry.</p>
                <Link href="/predictions/new" className="mt-2 inline-block font-medium text-accent hover:underline">
                  Write your first entry
                </Link>
              </Card>
            )}
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
