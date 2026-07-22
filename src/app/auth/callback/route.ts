import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing route for the DEFAULT Supabase email template.
// The default `{{ .ConfirmationURL }}` sends the user through Supabase's verify
// endpoint, which redirects here with a PKCE `?code=`. We exchange that code
// (paired with the code-verifier cookie set during signInWithOtp) for a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  // Supabase forwards its own errors as query params when verification fails.
  const authError = searchParams.get("error_description") ?? searchParams.get("error");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  const reason = encodeURIComponent(authError ?? "invalid_link");
  return NextResponse.redirect(new URL(`/login?error=${reason}`, origin));
}
