import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PredictionForm } from "./PredictionForm";

export default async function NewPredictionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards /predictions, but re-check so the type is
  // narrowed and the page is safe even if the matcher ever changes.
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto w-full max-w-lg p-6">
      <h1 className="text-2xl font-semibold">New prediction</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Write it in your own words, attach a confidence, and pick a resolution date.
      </p>
      <PredictionForm />
    </main>
  );
}
