import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/auth/actions";
import { buttonVariants } from "@/components/ui/button";
import { HeaderNav } from "./HeaderNav";

// `showWordmark` is false only on the landing page, where a large centered
// "Marne." hero wordmark already carries the brand — so it isn't shown twice.
export async function Header({ showWordmark = true }: { showWordmark?: boolean } = {}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] w-full max-w-5xl items-center gap-6 px-6 lg:px-8">
        {showWordmark && (
          <Link
            href="/dashboard"
            className="shrink-0 font-wordmark text-lg font-semibold tracking-tight text-ink"
          >
            Marne<span className="text-accent">.</span>
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
