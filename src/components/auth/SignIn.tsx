"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { buttonVariants } from "@/components/ui/button";
import { inputClasses } from "@/components/ui/input";
import { cx } from "@/components/ui/cx";

interface SignInContextValue {
  open: (error?: string | null) => void;
}

const SignInContext = createContext<SignInContextValue | null>(null);

export function useSignIn(): SignInContextValue {
  const ctx = useContext(SignInContext);
  if (!ctx) throw new Error("useSignIn must be used within SignInProvider");
  return ctx;
}

type Status = "idle" | "sending" | "sent" | "error";

function SignInModal({
  initialError,
  onClose,
}: {
  initialError: string | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(initialError);

  // Escape closes the modal, matching the backdrop click.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signInError) {
      setError(signInError.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-canvas p-6 shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to Calra"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-wordmark text-xl font-semibold tracking-tight text-ink">
              Sign in to Calra<span className="text-accent">.</span>
            </h2>
            <p className="mt-1 text-sm text-ink-secondary">
              We&apos;ll email you a magic link — no password to remember.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-tertiary hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {status === "sent" ? (
          <p className="mt-5 rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success">
            Check your inbox — we sent a sign-in link to <strong>{email}</strong>.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <input
              type="email"
              required
              autoFocus
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
    </div>
  );
}

/**
 * Wraps a subtree so any descendant can open the sign-in modal via `useSignIn`.
 * Auto-opens when the URL carries `?signin=1` (e.g. a guard redirected a
 * logged-out visitor here) or an `?error=` from the auth callback.
 */
export function SignInProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Read the URL only after mount: the modal must render closed on the server
  // and initial client render (window is unavailable during SSR, and opening
  // during render would be a hydration mismatch), then open once we're on the
  // client. This is a deliberate mount-time sync with an external source (the URL).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (params.get("signin") === "1" || err) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
      setIsOpen(true);
      if (err) setInitialError(decodeURIComponent(err));
    }
  }, []);

  const open = (error: string | null = null) => {
    setInitialError(error);
    setIsOpen(true);
  };

  return (
    <SignInContext.Provider value={{ open }}>
      {children}
      {isOpen && <SignInModal initialError={initialError} onClose={() => setIsOpen(false)} />}
    </SignInContext.Provider>
  );
}

/** A button that opens the sign-in modal. Styled like `buttonVariants`. */
export function SignInButton({
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const { open } = useSignIn();
  return (
    <button type="button" onClick={() => open()} className={cx(buttonVariants(variant, { size }), className)}>
      {children}
    </button>
  );
}
