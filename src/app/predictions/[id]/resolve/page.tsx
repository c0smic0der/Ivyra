import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { brierSentence } from "@/lib/scoring";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/Card";
import { Header } from "@/components/Header";
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
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-2xl">
          {/* Frozen prediction — verbatim, never editable. */}
          <Card>
            <p className="text-xl font-medium text-ink">{row.text}</p>
            <p className="mt-1 text-xs text-ink-tertiary">
              {confidencePercent}% confident · resolves {row.resolutionDate}
            </p>

            {(row.reasoning || row.planOrDisconfirm) && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-secondary">Your frozen reasoning</summary>
                <div className="mt-2 flex flex-col gap-2 text-ink-secondary">
                  {row.reasoning && (
                    <p>
                      <span className="text-ink-tertiary">Why:</span> {row.reasoning}
                    </p>
                  )}
                  {row.planOrDisconfirm && (
                    <p>
                      <span className="text-ink-tertiary">{secondFieldLabel}:</span>{" "}
                      {row.planOrDisconfirm}
                    </p>
                  )}
                </div>
              </details>
            )}
          </Card>

          {isOpen ? (
            <ResolveClient id={row.id} />
          ) : (
            // Read-only revisit — stored score + directional sentence + the saved
            // post-mortem. No regeneration, no AI call, no stats recompute.
            <section className="mt-8">
              {isVoid ? (
                <p className="rounded-xl border border-border p-4 text-sm text-ink-secondary">
                  Voided — excluded from your score.
                  {row.outcomeNote ? ` "${row.outcomeNote}"` : ""}
                </p>
              ) : (
                <Card>
                  <p className="text-sm text-ink-secondary">
                    Resolved{" "}
                    <strong className={row.outcome ? "text-success" : "text-danger"}>
                      {row.outcome ? "YES" : "NO"}
                    </strong>
                    {row.outcomeNote ? ` — "${row.outcomeNote}"` : ""}
                  </p>
                  {brier !== null && (
                    <>
                      <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">
                        {brier.toFixed(2)}
                      </p>
                      <p className="mt-1 text-sm text-ink-secondary">{brierSentence(brier)}</p>
                    </>
                  )}
                </Card>
              )}

              {row.postmortem && (
                <Card className="mt-4">
                  <CardLabel>Post-mortem</CardLabel>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-secondary">
                    {row.postmortem}
                  </p>
                </Card>
              )}
            </section>
          )}
        </div>
      </main>
    </>
  );
}
