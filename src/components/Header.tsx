import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandMark";
import { HeaderNav } from "./HeaderNav";

// `showWordmark` is false only on the landing page, where a large centered
// "Ivyra." hero wordmark already carries the brand — so it isn't shown twice.
export async function Header({
  showWordmark = true,
  showGetStarted = false,
}: { showWordmark?: boolean; showGetStarted?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-canvas/80 backdrop-blur-md">
      <div
        className={`mx-auto flex w-full max-w-5xl items-center gap-6 px-6 lg:px-8 ${
          showGetStarted && !user ? "h-20" : "h-[68px]"
        }`}
      >
        {showWordmark && (
          <Link href={user ? "/dashboard" : "/"} className="flex shrink-0 items-center gap-2" aria-label="Ivyra — home">
            <BrandMark className="h-6 w-6 shrink-0" />
            <span className="font-wordmark text-lg font-semibold tracking-tight text-ink">
              Ivyra<span className="text-accent">.</span>
            </span>
          </Link>
        )}

        <HeaderNav authed={Boolean(user)} />

        {user ? (
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="hidden text-xs text-ink-tertiary sm:inline">{user.email}</span>
            <form action={signOut}>
              <button type="submit" className={buttonVariants("ghost", { size: "md" })}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          showGetStarted && (
            <div className="relative ml-auto">
              <Link
                href="/?signin=1"
                className={buttonVariants("primary", { size: "md", className: "shrink-0" })}
              >
                Get started →
              </Link>
              <p className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-tertiary">
                No passwords, just a magic link
              </p>
            </div>
          )
        )}
      </div>
    </header>
  );
}
