import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalibrationChart } from "@/app/insights/CalibrationChart";
import type { CalibrationPoint } from "@/lib/insights/insightsCore";

const SAMPLE_POINTS: CalibrationPoint[] = [
  { x: 0.2, y: 0.22, n: 5 },
  { x: 0.4, y: 0.35, n: 8 },
  { x: 0.6, y: 0.5, n: 11 },
  { x: 0.8, y: 0.63, n: 9 },
  { x: 0.95, y: 0.72, n: 6 },
];

const STEPS = [
  {
    title: "1. Predict",
    body: "Write down what you think will happen, in your own words, with a confidence level from 1–99%.",
  },
  {
    title: "2. Resolve",
    body: "When the outcome lands, come back and mark it yes or no. Your original reasoning stays frozen — no rewriting history.",
  },
  {
    title: "3. See your calibration",
    body: "After a handful of resolutions, Caliber plots your stated confidence against what actually happened — so you can see exactly how good your gut really is.",
  },
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
    <main className="flex flex-1 justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Find out if your gut is actually right
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            Caliber turns your hunches into a track record. Predict, resolve, and watch your
            calibration curve tell you where your gut is right — and where it&apos;s fooling you.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900"
          >
            Get started
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <h2 className="text-sm font-medium">{step.title}</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Calibration curve
            </h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-900">
              Sample data
            </span>
          </div>
          <div className="mt-2 rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <CalibrationChart points={SAMPLE_POINTS} />
          </div>
          <p className="mt-2 text-center text-xs text-zinc-400">
            This isn&apos;t your data yet — it&apos;s what a calibration curve looks like.
          </p>
        </div>
      </div>
    </main>
  );
}
