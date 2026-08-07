import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { HeaderNav } from "./HeaderNav";

// `showWordmark` is false only on the landing page, where a large centered
// "Ivyra." hero wordmark already carries the brand — so it isn't shown twice.
export async function Header({ showWordmark = true }: { showWordmark?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] w-full max-w-5xl items-center gap-6 px-6 lg:px-8">
        {showWordmark && (
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2" aria-label="Ivyra — home">
            {/* Brand mark (icon.svg's shapes, inlined). The rounded square uses the
                accent token via currentColor so it matches the app + favicons; the
                diagonal and dot stay white. */}
            <svg viewBox="0 0 64 64" className="h-6 w-6 shrink-0 text-accent" aria-hidden>
              <rect x="0" y="0" width="64" height="64" rx="14" fill="currentColor" />
              <line
                x1="17"
                y1="47"
                x2="47"
                y2="17"
                stroke="#FFFFFF"
                strokeWidth="5"
                strokeLinecap="round"
                opacity="0.55"
              />
              <circle cx="26" cy="21.5" r="6" fill="#FFFFFF" />
            </svg>
            <span className="font-wordmark text-lg font-semibold tracking-tight text-ink">Ivyra</span>
          </Link>
        )}

        <HeaderNav authed={Boolean(user)} />

        {user && (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-ink-tertiary sm:inline">{user.email}</span>
            <form action={signOut}>
              <button type="submit" className={buttonVariants("ghost", { size: "md" })}>
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
