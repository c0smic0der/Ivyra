import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalibrationChart } from "@/app/insights/CalibrationChart";
import type { CalibrationPoint } from "@/lib/insights/insightsCore";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { STEPS } from "@/lib/content/howItWorks";

const SAMPLE_POINTS: CalibrationPoint[] = [
  { x: 0.2, y: 0.22, n: 5 },
  { x: 0.4, y: 0.35, n: 8 },
  { x: 0.6, y: 0.5, n: 11 },
  { x: 0.8, y: 0.63, n: 9 },
  { x: 0.95, y: 0.72, n: 6 },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <>
      <Header />
      <main className="flex flex-1 justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
              Find out if your gut is actually right
            </h1>
            <p className="mt-4 text-base text-ink-secondary">
              Calra turns your hunches into a track record. Predict, resolve, and watch your
              calibration curve tell you where your gut is right — and where it&apos;s fooling you.
            </p>
            <Link href="/login" className={buttonVariants("primary", { className: "mt-6 inline-flex" })}>
              Get started
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <Card key={step.title} as="div">
                <h2 className="text-sm font-medium text-ink">{step.title}</h2>
                <p className="mt-1 text-sm text-ink-secondary">{step.body}</p>
              </Card>
            ))}
          </div>

          <div className="mt-16">
            <div className="flex items-center justify-between">
              <CardLabel>Calibration curve</CardLabel>
              <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-ink-tertiary">
                Sample data
              </span>
            </div>
            <Card as="div" className="mt-2">
              <CalibrationChart points={SAMPLE_POINTS} />
            </Card>
            <p className="mt-2 text-center text-xs text-ink-tertiary">
              This isn&apos;t your data yet — it&apos;s what a calibration curve looks like.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
