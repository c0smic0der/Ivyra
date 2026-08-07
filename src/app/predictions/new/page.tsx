import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_TEMPLATES } from "@/lib/onboarding/templates";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { PredictionForm } from "./PredictionForm";
import { EntryDate } from "./EntryDate";

export default async function NewPredictionPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards /predictions, but re-check so the type is
  // narrowed and the page is safe even if the matcher ever changes.
  if (!user) {
    redirect("/?signin=1");
  }

  // Only the template key rides the URL (an opaque key, never user content). A
  // quick-capture draft arrives via sessionStorage instead (see PredictionForm),
  // so prediction text never appears in the URL.
  const { template: rawTemplate } = await searchParams;
  const templateKey = Array.isArray(rawTemplate) ? rawTemplate[0] : rawTemplate;
  const initial = ONBOARDING_TEMPLATES.find((t) => t.key === templateKey);

  // Onboarding, no wizard: a brand-new user (no entries yet) sees tappable worked
  // examples right here, so their first saved entry is one tap and a Save away.
  // The row disappears once they've written anything — this is the capture screen
  // for everyone, and only new users need the training wheels.
  const [existing] = await db
    .select({ id: schema.predictions.id })
    .from(schema.predictions)
    .where(eq(schema.predictions.userId, user.id))
    .limit(1);
  const isFirstEntry = !existing;

  return (
    <>
      <Header />
      <main className="page-gradient flex flex-1 justify-center px-6 py-8 lg:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div>
            {/* Shared page-title treatment (dashboard / insights / account). */}
            <h1 className="border-l-2 border-accent/40 pl-4 text-3xl font-semibold tracking-tight text-ink">
              New entry
            </h1>
            <EntryDate />
          </div>

          {isFirstEntry && (
            <div className="mt-6 rounded-xl border border-accent/20 bg-accent-tint p-4">
              <p className="text-sm text-ink">
                <span className="font-medium">Start from an example</span> — tap one to fill it in,
                then set your confidence and save. You can edit every word.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ONBOARDING_TEMPLATES.map((t) => (
                  <Link
                    key={t.key}
                    href={`/predictions/new?template=${t.key}`}
                    className="rounded-full border border-accent/30 bg-canvas px-3 py-1.5 text-sm text-ink transition-colors hover:border-accent hover:bg-accent-tint"
                  >
                    {t.label}
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-tertiary">
                Confidence and a date are all it takes. The reasoning field is optional — it&apos;s
                just the part you&apos;ll read back later.
              </p>
            </div>
          )}

          <Card className="mt-8">
            <PredictionForm
              key={templateKey ?? "blank"}
              initialText={initial?.text}
              initialKind={initial?.kind}
              initialConfidence={initial?.confidence}
            />
          </Card>
        </div>
      </main>
    </>
  );
}
