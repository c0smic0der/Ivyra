"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";

// A DEVELOPMENT-ONLY email+password sign-in, so the seeded demo account (which is
// magic-link only in the hosted flow) can be logged into locally without an
// inbox. Production is magic-link only and must never render or ship this.
//
// The gate reads `process.env.NODE_ENV`, which Next inlines as a literal at build
// time. In a production build `devSignInEnabled()` folds to `return false`, so
// the caller's `devSignInEnabled() && <DevPasswordSignIn/>` becomes dead code and
// the component is tree-shaken out of the client bundle. The unit test also
// asserts it is absent from a production render.
export function devSignInEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function DevPasswordSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setStatus("error");
      return;
    }
    // Full navigation so the server re-reads the fresh session cookie and the
    // route guards let us through.
    window.location.assign("/dashboard");
  }

  return (
    <div className="mt-5 rounded-xl border border-dashed border-border bg-surface p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
        Dev only · password sign-in
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="demo email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClasses()}
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClasses()}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className={buttonVariants("secondary", { className: "disabled:opacity-50" })}
        >
          {status === "submitting" ? "Signing in…" : "Sign in with password"}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </div>
  );
}
