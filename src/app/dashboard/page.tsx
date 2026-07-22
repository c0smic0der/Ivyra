import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

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

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Signed in as <strong>{user.email}</strong>
          </p>
        </div>

        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/predictions/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            New prediction
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Sign out
            </button>
          </form>
        </div>

        {dueForResolution.length > 0 && (
          <section className="mt-10">
            <h2 className="text-sm font-medium text-zinc-500">Due for resolution</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {dueForResolution.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/predictions/${row.id}/resolve`}
                    className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
                  >
                    <span>
                      <span className="block">{row.text}</span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {Math.round(Number(row.confidence) * 100)}% · due {row.resolutionDate}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-zinc-900">
                      Resolve
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-sm font-medium text-zinc-500">Open predictions</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">
              {dueForResolution.length > 0
                ? "Nothing else open — resolve the ones above."
                : "Nothing open yet — log your first prediction above."}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {upcoming.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                >
                  <p>{row.text}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {Math.round(Number(row.confidence) * 100)}% · resolves {row.resolutionDate}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
