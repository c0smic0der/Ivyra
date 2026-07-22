import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. SERVER-ONLY: SUPABASE_SERVICE_ROLE_KEY
// must never be prefixed NEXT_PUBLIC_ and this module must never be imported
// from a Server Component, Client Component, or anything reachable from the
// browser bundle. Today it exists for exactly one caller: the cron reminders
// route, which has no signed-in session and needs to resolve a user's email
// from their id via the Auth admin API.
let client: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
    if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

/** Resolves a user's email by id via the Auth admin API. Null if not found. */
export async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}
