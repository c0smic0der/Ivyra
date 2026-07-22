import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDED_COOKIE_NAME } from "@/lib/onboarding/onboardedCookie";
import { ONBOARDING_TEMPLATES } from "@/lib/onboarding/templates";
import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const alreadyOnboarded = cookieStore.get(ONBOARDED_COOKIE_NAME)?.value === "1";

  if (alreadyOnboarded) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    redirect(user ? "/dashboard" : "/login");
  }

  return (
    <main className="flex flex-1 justify-center bg-canvas p-6">
      <div className="w-full max-w-md">
        <OnboardingFlow templates={ONBOARDING_TEMPLATES} />
      </div>
    </main>
  );
}
