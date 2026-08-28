"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { CAPTURE_PATH, stashQuickDraft } from "@/lib/onboarding/quickCaptureDraft";

// The dashboard quick-capture box. On submit the draft is stashed in
// sessionStorage and we navigate to a BARE /predictions/new — the prediction text
// never enters the URL (the old GET form put it in ?draft=, which leaked content
// to history/Referer/logs). The capture form reads the stash on mount.
export function QuickCapture() {
  const router = useRouter();
  const [draft, setDraft] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        stashQuickDraft(sessionStorage, draft);
        router.push(CAPTURE_PATH); // constant path, no query string
      }}
      className="mt-6 flex flex-col gap-2 sm:flex-row"
    >
      {/* No `name` attribute: the field is submitted via JS, never serialized
          into a query string by a native GET submit. */}
      <input
        type="text"
        required
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="What are you deciding?"
        aria-label="Quick-capture a decision"
        className={inputClasses("flex-1")}
      />
      <button type="submit" className={buttonVariants("primary")}>
        Log it →
      </button>
    </form>
  );
}
