"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  // Surface an error handed back by /auth/callback (e.g. an expired link).
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason) setError(decodeURIComponent(reason));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in to Caliber</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Enter your email and we&apos;ll send you a magic link.
        </p>

        {status === "sent" ? (
          <p className="mt-6 rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success">
            Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses()}
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className={buttonVariants("primary", { className: "disabled:opacity-50" })}
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {error && <p className="text-sm text-danger">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
