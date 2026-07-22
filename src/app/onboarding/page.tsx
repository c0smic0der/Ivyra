import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_TEMPLATES } from "@/lib/onboarding/templates";
import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts already guards /onboarding; re-check so the page is safe even
  // if the matcher ever changes.
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-md">
        <OnboardingFlow templates={ONBOARDING_TEMPLATES} />
      </div>
    </main>
  );
}
