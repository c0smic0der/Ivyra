import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session and guards protected routes.
// Runs inside proxy.ts (the Next.js 16 replacement for middleware).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token with Supabase. Do not add other
  // logic between creating the client and this call, or sessions can desync.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /how-it-works is intentionally NOT protected — it's a public explainer,
  // shown to logged-out visitors and force-shown once on first login by the
  // client-side HowItWorksGate (see components/HowItWorksGate.tsx).
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/dashboard") || path.startsWith("/predictions");

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // /admin is owner-only. Gate it HERE (before the page loads) so a non-admin —
  // whether logged out, the demo user, or any other account — gets the standard
  // not-found page, byte-for-byte the same category as any unmatched URL: no
  // admin route content, no admin-segment RSC payload, no login redirect that
  // would betray the route exists. Rewriting (not redirecting) keeps the URL and
  // renders Next's 404 for an unmatched path; the in-page notFound() stays as
  // defense-in-depth if this matcher ever changes.
  if (path === "/admin" || path.startsWith("/admin/")) {
    const adminUserId = process.env.ADMIN_USER_ID;
    if (!adminUserId || !user || user.id !== adminUserId) {
      const url = request.nextUrl.clone();
      url.pathname = "/_not-found";
      return NextResponse.rewrite(url);
    }
  }

  return response;
}
