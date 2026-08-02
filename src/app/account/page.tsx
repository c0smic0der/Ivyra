import Link from "next/link";
import { requireUser } from "@/lib/auth/requireUser";
import { Header } from "@/components/Header";
import { Card, CardLabel } from "@/components/ui/Card";
import { DeleteAccountForm } from "./DeleteAccountForm";

export const metadata = {
  title: "Account · Ivyra",
  description: "Manage your Ivyra account and data.",
};

// UTC so the displayed join date can't drift a day either side of a timezone
// boundary (repo convention: calendar dates are UTC).
function formatJoinDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default async function AccountPage() {
  const user = await requireUser();
  const joined = formatJoinDate(user.created_at);

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12 lg:px-8">
        <h1 className="font-wordmark text-2xl font-semibold tracking-tight text-ink">Account</h1>

        <Card className="mt-8">
          <CardLabel>Account details</CardLabel>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-ink-secondary">Email</dt>
              <dd className="text-ink">{user.email}</dd>
            </div>
            {joined && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-secondary">Member since</dt>
                <dd className="text-ink">{joined}</dd>
              </div>
            )}
          </dl>
          <p className="mt-4 text-xs text-ink-tertiary">
            See our{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              Privacy Policy
            </Link>{" "}
            for what we store and which services process it. To request a copy of your data, email{" "}
            <a href="mailto:demouser4132+privacy@gmail.com" className="text-accent hover:underline">
              demouser4132+privacy@gmail.com
            </a>
            .
          </p>
        </Card>

        <Card className="mt-6 border-danger/30">
          <CardLabel className="text-danger">Danger zone</CardLabel>
          <div className="mt-3 space-y-3 text-sm text-ink-secondary">
            <p>
              Deleting your account is{" "}
              <span className="font-medium text-ink">immediate and irreversible</span>. It removes{" "}
              <span className="font-medium text-ink">
                all of your predictions, the reasoning you wrote, your scores, your AI insights and
                post-mortems, and the account itself
              </span>
              . There is no recovery and no grace period.
            </p>
          </div>
          <DeleteAccountForm email={user.email ?? ""} />
        </Card>
      </main>
    </>
  );
}
