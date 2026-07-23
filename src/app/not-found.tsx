import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";

// Root not-found UI. Rendered for BOTH unmatched URLs and every explicit
// notFound() call — including the /admin/costs gate, which calls notFound() for
// a non-admin, a logged-out visitor, and a genuinely missing route alike. Since
// all three render this same page (identical 404 status and body), the admin
// surface is indistinguishable from any other 404. Keep this a static Server
// Component (no auth read, no data fetch) so there's no timing tell either.
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">404</p>
        <h1 className="mt-2 text-xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        </p>
        <Link href="/dashboard" className={buttonVariants("primary", { size: "sm", className: "mt-6" })}>
          Back to dashboard
        </Link>
      </Card>
    </main>
  );
}
