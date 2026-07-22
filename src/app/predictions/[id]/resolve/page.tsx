import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { brierSentence } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { ResolveClient } from "./ResolveClient";

export default async function ResolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [row] = await db
    .select()
    .from(schema.predictions)
    .where(and(eq(schema.predictions.id, id), eq(schema.predictions.userId, user.id)));

  if (!row) notFound();

  const isOpen = row.status === "open";
  const isVoid = row.status === "void";
  const confidencePercent = Math.round(Number(row.confidence) * 100);
  const brier = row.brierScore === null ? null : Number(row.brierScore);
  const secondFieldLabel = row.predictionKind === "self" ? "Your plan" : "What would change your mind";

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-md">
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">
          ← Dashboard
        </Link>

        {/* Frozen prediction — verbatim, never editable. */}
        <section className="mt-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-lg font-medium">{row.text}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {confidencePercent}% confident · resolves {row.resolutionDate}
          </p>

          {(row.reasoning || row.planOrDisconfirm) && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-zinc-500">Your frozen reasoning</summary>
              <div className="mt-2 flex flex-col gap-2 text-zinc-700 dark:text-zinc-300">
                {row.reasoning && (
                  <p>
                    <span className="text-zinc-400">Why:</span> {row.reasoning}
                  </p>
                )}
                {row.planOrDisconfirm && (
                  <p>
                    <span className="text-zinc-400">{secondFieldLabel}:</span> {row.planOrDisconfirm}
                  </p>
                )}
              </div>
            </details>
          )}
        </section>

        {isOpen ? (
          <ResolveClient id={row.id} />
        ) : (
          // Read-only revisit — stored score + directional sentence + the saved
          // post-mortem. No regeneration, no AI call, no stats recompute.
          <section className="mt-6">
            {isVoid ? (
              <p className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
                Voided — excluded from your score.
                {row.outcomeNote ? ` "${row.outcomeNote}"` : ""}
              </p>
            ) : (
              <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="text-sm text-zinc-500">
                  Resolved <strong>{row.outcome ? "YES" : "NO"}</strong>
                  {row.outcomeNote ? ` — "${row.outcomeNote}"` : ""}
                </p>
                {brier !== null && (
                  <>
                    <p className="mt-2 text-3xl font-semibold tabular-nums">{brier.toFixed(2)}</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {brierSentence(brier)}
                    </p>
                  </>
                )}
              </div>
            )}

            {row.postmortem && (
              <div className="mt-4 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Post-mortem
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                  {row.postmortem}
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
