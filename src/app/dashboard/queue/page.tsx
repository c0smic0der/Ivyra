import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth/requireUser";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { Header } from "@/components/Header";

// The demoted dashboard. The home is now the journal timeline (docs/04-journal-
// reframe §3.2); the old open/due lists survive here, reached from the "N ready
// to resolve" strip. Read-side only, scoped to the authenticated user. Resolved
// history lives on /insights ("View all resolutions" below).
export default async function ResolveQueuePage() {
  const user = await requireUser();

  const openPredictions = await db
    .select()
    .from(schema.predictions)
    .where(and(eq(schema.predictions.userId, user.id), eq(schema.predictions.status, "open")))
    .orderBy(asc(schema.predictions.resolutionDate));

  // resolution_date is a bare date; compare against today's UTC date string.
  const todayIso = new Date().toISOString().slice(0, 10);
  const dueForResolution = openPredictions.filter((row) => row.resolutionDate <= todayIso);
  const upcoming = openPredictions.filter((row) => row.resolutionDate > todayIso);

  return (
    <>
      <Header />
      <main className="page-gradient flex flex-1 justify-center px-6 py-8 lg:px-8">
        <div className="w-full max-w-2xl">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Resolve queue</h1>
            <Link href="/dashboard" className="text-sm text-accent hover:underline">
              ← Back to journal
            </Link>
          </div>

          {/* Due for resolution — the reason to be on this page. */}
          <section className="mt-8">
            <h2 className="text-base font-semibold text-ink">Ready to resolve</h2>
            {dueForResolution.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2">
                {dueForResolution.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/predictions/${row.id}/resolve`}
                      className="interactive-surface flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm hover:!border-warning/60"
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

          {/* Open, not-yet-due entries. */}
          <section className="mt-10">
            <h2 className="text-base font-semibold text-ink">Open entries</h2>
            {upcoming.length === 0 ? (
              <p className="mt-3 text-sm text-ink-tertiary">
                {openPredictions.length > 0
                  ? "Nothing else open — resolve the ones above."
                  : "Nothing open right now."}
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

          <p className="mt-10 text-center text-sm text-ink-tertiary">
            Looking for resolved entries? See{" "}
            <Link href="/insights" className="text-accent hover:underline">
              all resolutions in Insights
            </Link>
            .
          </p>
        </div>
      </main>
    </>
  );
}
