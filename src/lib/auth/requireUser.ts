import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth guard for pages that must not render for a signed-out visitor. Returns the
 * signed-in user, or redirects to the landing page (which opens the sign-in modal
 * via `?signin=1`) and never returns. `redirect()` throws, so callers can treat
 * the return as a non-null `User`.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/?signin=1");
  }
  return user;
}
