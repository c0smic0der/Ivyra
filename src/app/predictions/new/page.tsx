import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_TEMPLATES } from "@/lib/onboarding/templates";
import { Card } from "@/components/ui/Card";
import { Header } from "@/components/Header";
import { PredictionForm } from "./PredictionForm";

export default async function NewPredictionPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[]; draft?: string | string[] }>;
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

  const { template: rawTemplate, draft: rawDraft } = await searchParams;
  const templateKey = Array.isArray(rawTemplate) ? rawTemplate[0] : rawTemplate;
  const draftText = Array.isArray(rawDraft) ? rawDraft[0] : rawDraft;
  const initial = ONBOARDING_TEMPLATES.find((t) => t.key === templateKey);

  return (
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">New prediction</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Write it in your own words, attach a confidence, and pick a resolution date.
          </p>
          <Card className="mt-8">
            <PredictionForm
              key={templateKey ?? draftText ?? "blank"}
              initialText={initial?.text ?? draftText}
              initialKind={initial?.kind}
              initialConfidence={initial?.confidence}
            />
          </Card>
        </div>
      </main>
    </>
  );
}
