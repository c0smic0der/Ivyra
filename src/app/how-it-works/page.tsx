import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { STEPS } from "@/lib/content/howItWorks";

export default async function HowItWorksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">How it works</h1>
          <p className="mt-3 max-w-2xl text-base text-ink-secondary">
            Most of us think we have decent instincts — but we rarely check. Calra has you write
            down predictions with a confidence level, then track what actually happens. Do that
            enough times, and it shows you exactly where your gut is right, and where it&apos;s
            fooling you.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <Card key={step.title} as="div">
                <h2 className="text-sm font-medium text-ink">{step.title}</h2>
                <p className="mt-1 text-sm text-ink-secondary">{step.body}</p>
              </Card>
            ))}
          </div>

          <Card className="mt-8">
            <CardLabel>For example</CardLabel>
            <p className="mt-2 text-sm text-ink-secondary">
              You write: &quot;80% sure I&apos;ll finish this by Friday.&quot; Friday comes and
              you&apos;re still not done — that one gets marked NO. Repeat that a few dozen times,
              and your calibration curve reveals whether your &quot;80% sure&quot; calls actually
              come true 80% of the time — or if you&apos;re consistently overconfident.
            </p>
          </Card>

          <Link
            href={user ? "/dashboard" : "/login"}
            className={buttonVariants("primary", { className: "mt-8 inline-flex" })}
          >
            {user ? "Go to dashboard →" : "Get started"}
          </Link>
        </div>
      </main>
    </>
  );
}
