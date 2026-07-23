"use client";

import { useEffect } from "react";
import { markHowItWorksSeen } from "@/lib/onboarding/howItWorksSeen";

// Records that the explainer has been viewed, the moment it mounts. This is what
// stops the first-login gate from firing again: once you've landed here even
// once, the dashboard gate reads "seen" and leaves you alone. Renders nothing.
export function MarkSeen() {
  useEffect(() => {
    markHowItWorksSeen();
  }, []);

  return null;
}
