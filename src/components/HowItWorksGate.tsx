"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasSeenHowItWorks } from "@/lib/onboarding/howItWorksSeen";

// Renders nothing. Mounted on the dashboard (where first logins land): on mount,
// if the user has never seen the explainer, send them to /how-it-works once.
//
// Loop-safety: /how-it-works marks itself seen on mount, so a returning visit to
// the dashboard reads "seen" and this no-ops. And because hasSeenHowItWorks()
// resolves to true whenever storage is unavailable, a broken/absent localStorage
// simply means we never force-redirect — it can't strand the user in a loop.
export function HowItWorksGate() {
  const router = useRouter();

  useEffect(() => {
    if (!hasSeenHowItWorks()) {
      router.replace("/how-it-works");
    }
  }, [router]);

  return null;
}
