import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { ResolveClient } from "./ResolveClient";

export default async function ResolvePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?signin=1");

  const [row] = await db
    .select()
    .from(schema.predictions)
    .where(and(eq(schema.predictions.id, id), eq(schema.predictions.userId, user.id)));

  if (!row) notFound();

  // This route is the resolve flow for OPEN predictions only — including early
  // resolution (there's no due-date gate) and the target of the reminder emails.
  // The read-only detail view of an already-resolved prediction has moved: the
  // complete record now lives as a self-contained, expandable card in the
  // /insights history, so a resolved/void prediction deep-links straight to it.
  if (row.status !== "open") redirect(`/insights?resolution=${row.id}#history`);

  const confidencePercent = Math.round(Number(row.confidence) * 100);
  const secondFieldLabel = row.predictionKind === "self" ? "Your plan" : "What would change your mind";

  return (
    <>
      <Header />
      <main className="page-gradient flex flex-1 justify-center px-6 py-8 lg:px-8">
        <div className="w-full max-w-3xl">
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
                      <span className="text-ink-tertiary">{secondFieldLabel}:</span> {row.planOrDisconfirm}
                    </p>
                  )}
                </div>
              </details>
            )}
          </Card>

          <ResolveClient id={row.id} />
        </div>
      </main>
    </>
  );
}
