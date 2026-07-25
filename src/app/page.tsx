import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalibrationChart } from "@/app/insights/CalibrationChart";
import type { CalibrationPoint } from "@/lib/insights/insightsCore";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { SignInButton, SignInProvider } from "@/components/auth/SignIn";
import { STEPS } from "@/lib/content/howItWorks";

// Marketing sample only — empty `predictions` makes the chart's drill-down
// self-disable, so this renders as a static curve with no click affordance.
const SAMPLE_POINTS: CalibrationPoint[] = [
  { x: 0.2, y: 0.22, n: 5, low: 0.2, high: 0.3, predictions: [] },
  { x: 0.4, y: 0.35, n: 8, low: 0.4, high: 0.5, predictions: [] },
  { x: 0.6, y: 0.5, n: 11, low: 0.6, high: 0.7, predictions: [] },
  { x: 0.8, y: 0.63, n: 9, low: 0.8, high: 0.9, predictions: [] },
  { x: 0.95, y: 0.72, n: 6, low: 0.9, high: 1, predictions: [] },
];

// --- small inline visuals (no external assets) -----------------------------

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-tint text-accent">
      {children}
    </span>
  );
}

const STEP_ICONS = [
  // predict — pencil
  <svg key="p" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>,
  // resolve — check circle
  <svg key="r" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" />
    <path d="m9 11 3 3L22 4" />
  </svg>,
  // recalibrate — target
  <svg key="c" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.5" fill="currentColor" />
  </svg>,
];

/** A compact "here's what you'd see" product teaser for the hero. */
function DashboardPreview() {
  return (
    <Card as="div" className="animate-fade-up">
      <div className="flex items-center justify-between">
        <CardLabel>Your calibration</CardLabel>
        <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[10px] font-medium text-accent">
          After ~20 calls
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-ink">0.18</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">Brier — beats the 0.25 coin-flip</p>
        </div>
        <div>
          <p className="text-3xl font-semibold tabular-nums text-ink">+14</p>
          <p className="mt-0.5 text-xs text-ink-tertiary">points overconfident</p>
        </div>
      </div>

      {/* bias meter */}
      <div className="mt-5">
        <div className="flex justify-between text-[10px] uppercase tracking-wide text-ink-tertiary">
          <span>Underconfident</span>
          <span>Overconfident</span>
        </div>
        <div className="relative mt-1 h-2 rounded-full bg-surface">
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
          <div className="animate-grow-x absolute left-1/2 top-0 h-full rounded-full bg-accent" style={{ width: "26%" }} />
        </div>
      </div>

      {/* rolling-Brier sparkline, trending down (improving) */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <CardLabel>Rolling Brier</CardLabel>
          <span className="text-xs text-ink-tertiary">0.24 → 0.16</span>
        </div>
        <svg viewBox="0 0 220 56" className="mt-2 w-full" preserveAspectRatio="none" aria-hidden>
          <polyline
            className="animate-draw"
            style={{ "--draw-len": "320" } as React.CSSProperties}
            points="0,14 37,22 73,16 110,30 147,34 183,42 220,46"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Card>
  );
}

function LegendDot({ className }: { className: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`} />;
}

// Research the loop is built on. Every finding is paraphrased (no text/figures
// reproduced) and carries a visible, followable citation. These cite findings
// only — no researcher, institution, or publication endorses or is affiliated
// with this app. Figures are verified against the primary sources:
//  · 6–11% accuracy gain from <1h training, every tournament year — the paper's
//    own abstract (Chang et al., 2016).
//  · Weather-forecaster reliability — Murphy & Winkler (1977).
//  · Score + bias readout alone did NOT improve calibration — Martin & Mandel (2025).
const EVIDENCE: { headline: string; body: React.ReactNode; cite: string; href: string }[] = [
  {
    headline: "Training moves the needle",
    body: (
      <>
        In a four-year, government-sponsored forecasting tournament, people who did a short
        probabilistic-reasoning exercise — under an hour — went on to make{" "}
        <span className="font-medium text-ink">about 6–11% more accurate</span> predictions than an
        untrained group, in every year of the study.
      </>
    ),
    cite: "Chang, Chen, Mellers & Tetlock — Judgment and Decision Making (2016)",
    href: "https://www.cambridge.org/core/journals/judgment-and-decision-making/article/developing-expert-political-judgment-the-impact-of-training-and-practice-on-judgmental-accuracy-in-geopolitical-forecasting-tournaments/123EB18425391D05FA6581FDBB3F309F",
  },
  {
    headline: "The feedback loop works in the wild",
    body: (
      <>
        Weather forecasters are the classic case: their probability forecasts are strikingly
        well-calibrated — when they say a{" "}
        <span className="font-medium text-ink">70% chance of rain, it rains on about 70%</span> of
        those days — a benchmark of what steady, scored feedback produces.
      </>
    ),
    cite: "Murphy & Winkler — J. Royal Statistical Society, Series C (1977)",
    href: "https://rss.onlinelibrary.wiley.com/doi/abs/10.2307/2346866",
  },
  {
    headline: "But a score alone isn't enough",
    body: (
      <>
        A 2025 experiment found that showing people their calibration score and an
        over/under-confidence readout{" "}
        <span className="font-medium text-ink">did not, on its own, improve their calibration</span>.
        A bare number doesn&apos;t teach — which is exactly why Marne never stops at one.
      </>
    ),
    cite: "Martin & Mandel — Futures & Foresight Science (2025)",
    href: "https://onlinelibrary.wiley.com/doi/full/10.1002/ffo2.199",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  // Set by the account-deletion action, which signs out then lands here. The user
  // now has no session, so we don't redirect them to /dashboard above.
  const justDeleted = (await searchParams)?.deleted === "1";

  return (
    <SignInProvider>
      {justDeleted && (
        <div className="w-full border-b border-success/20 bg-success/5">
          <p className="mx-auto max-w-5xl px-6 py-3 text-center text-sm text-success">
            Your account and all of your data have been permanently deleted.
          </p>
        </div>
      )}
      {/* Landing-only top bar: brand + the two CTAs (no app nav tabs). */}
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-5xl items-center justify-between gap-4 px-6">
          <span className="font-wordmark text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Marne<span className="text-accent">.</span>
          </span>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/how-it-works" className={buttonVariants("secondary", { size: "md" })}>
                See how it works
              </Link>
              <SignInButton size="md">Get started</SignInButton>
            </div>
            <p className="text-[10px] text-ink-tertiary">
              Private by default · No passwords, just a magic link
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center">
        {/* HERO */}
        <section className="w-full bg-gradient-to-b from-accent-tint/60 to-transparent">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-2 lg:pb-24 lg:pt-14">
            <div className="animate-fade-up">
              <span className="inline-block rounded-full border border-border bg-canvas px-3 py-1 text-xs font-medium text-ink-secondary">
                A decision journal with a real score
              </span>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
                Sharpen the judgment behind every decision.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-secondary">
                Marne turns your real-life predictions into an honest track record — showing where
                your confidence is trustworthy, where it fools you, and how to recalibrate. Better
                calls, backed by proof.
              </p>
            </div>

            <div className="lg:pl-6">
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* HOOK */}
        <section className="w-full px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              You make dozens of judgment calls a week.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
              Deadlines, money, hiring, your own habits. How many actually pan out? Most people never
              find out — so the same confident mistakes repeat for years. Marne keeps score with math
              you can&apos;t fudge, and shows you exactly where to adjust.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="w-full bg-surface px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <CardLabel as="p">How it works</CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Three steps, thirty seconds each
              </h2>
            </div>
            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <Card key={step.title} as="div">
                  <StepIcon>{STEP_ICONS[i]}</StepIcon>
                  <h3 className="mt-4 text-base font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{step.body}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* BENEFITS */}
        <section className="w-full px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <CardLabel as="p">What you get</CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Not just a journal — a mirror for your judgment
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {/* overconfidence */}
              <Card as="div" className="flex flex-col">
                <h3 className="text-base font-semibold text-ink">Catch your overconfidence</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                  One Bias score tells you whether your 90%s are really 90%s. For most people, they
                  aren&apos;t — and that gap is where decisions go wrong.
                </p>
                <div className="mt-auto pt-5">
                  <div className="flex justify-between text-[10px] uppercase tracking-wide text-ink-tertiary">
                    <span>Under</span>
                    <span>Over</span>
                  </div>
                  <div className="relative mt-1 h-2 rounded-full bg-surface">
                    <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
                    <div className="absolute left-1/2 top-0 h-full rounded-full bg-accent" style={{ width: "30%" }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-tertiary">
                    <span className="font-medium text-ink">+14 points</span> overconfident
                  </p>
                </div>
              </Card>

              {/* improvement */}
              <Card as="div" className="flex flex-col">
                <h3 className="text-base font-semibold text-ink">Watch yourself get sharper</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                  Your rolling Brier score turns &quot;am I improving?&quot; into a line you can
                  actually watch bend — recent calls weighed against your lifetime average.
                </p>
                <div className="mt-auto pt-5">
                  <svg viewBox="0 0 220 56" className="w-full" preserveAspectRatio="none" aria-hidden>
                    <line x1="0" y1="28" x2="220" y2="28" stroke="var(--color-border)" strokeDasharray="4 4" />
                    <polyline
                      points="0,16 37,24 73,18 110,30 147,36 183,42 220,48"
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="mt-2 text-xs text-ink-tertiary">
                    Last 20: <span className="font-medium text-ink">0.16</span> vs 0.24 lifetime
                  </p>
                </div>
              </Card>

              {/* post-mortem */}
              <Card as="div" className="flex flex-col">
                <h3 className="text-base font-semibold text-ink">Learn from every miss</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                  When a call goes wrong, Marne diffs what you predicted against what happened —
                  anchored only to what you wrote, never invented.
                </p>
                <div className="mt-auto pt-5">
                  <div className="rounded-xl border border-border-subtle bg-surface p-3">
                    <CardLabel as="p">Looking back</CardLabel>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                      &quot;Your reasoning never mentioned the dependency that caused the slip — the
                      third deadline miss that came from outside your team.&quot;
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* CALIBRATION CURVE EXPLAINED */}
        <section className="w-full bg-surface px-6 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <CardLabel as="p">The calibration curve</CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                See exactly where your gut is right
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                Each dot groups the predictions you made at a similar confidence level, then plots
                that confidence against how often you were actually right.
              </p>
              <ul className="mt-5 flex flex-col gap-3 text-sm text-ink-secondary">
                <li className="flex items-start gap-2.5">
                  <span className="mt-2 h-0 w-5 shrink-0 border-t border-dashed border-ink-tertiary" />
                  <span>
                    <span className="font-medium text-ink">The dashed diagonal</span> is perfect
                    calibration — where saying 70% means it happens 70% of the time.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <LegendDot className="mt-1 bg-accent" />
                  <span>
                    <span className="font-medium text-ink">Dots below the line</span> mean you were
                    overconfident; above means underconfident.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <LegendDot className="mt-1 bg-ink-tertiary/40" />
                  <span>The closer your dots hug the diagonal, the more your confidence can be trusted.</span>
                </li>
              </ul>
            </div>

            <div>
              <Card as="div">
                <div className="flex items-center justify-between">
                  <CardLabel>Calibration curve</CardLabel>
                  <span className="rounded-full border border-border bg-canvas px-2 py-0.5 text-xs font-medium text-ink-tertiary">
                    Sample data
                  </span>
                </div>
                <div className="mt-2">
                  <CalibrationChart points={SAMPLE_POINTS} />
                </div>
              </Card>
              <p className="mt-2 text-center text-xs text-ink-tertiary">
                This isn&apos;t your data yet — it&apos;s what a calibration curve looks like.
              </p>
            </div>
          </div>
        </section>

        {/* GROUNDED IN RESEARCH */}
        <section className="w-full px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <CardLabel as="p">Grounded in research</CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Built on what the research shows works
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-secondary">
                The loop Marne runs — make a call, see what happens, get a real score, adjust — is one
                of the most studied ways to sharpen judgment. A few of the findings we built on:
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {EVIDENCE.map((e) => (
                <Card key={e.headline} as="div" className="flex flex-col">
                  <h3 className="text-base font-semibold text-ink">{e.headline}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{e.body}</p>
                  <p className="mt-auto pt-5">
                    <a
                      href={e.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ink-tertiary underline decoration-border underline-offset-2 transition-colors hover:text-ink"
                    >
                      {e.cite} ↗
                    </a>
                  </p>
                </Card>
              ))}
            </div>

            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-ink-tertiary">
              These are findings about calibration in general, not a promise about your results. We
              lean on the mechanism the evidence supports — and because a bare score doesn&apos;t
              teach on its own, Marne pairs every number with plain-language interpretation and a
              concrete technique to try next.
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="w-full px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Start your track record today
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
              It takes about thirty seconds to log your first prediction. In a few weeks, you&apos;ll
              know something about yourself most people never do.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <SignInButton className="text-base">Get started — it&apos;s free</SignInButton>
              <Link href="/how-it-works" className={buttonVariants("secondary", { className: "text-base" })}>
                See how it works
              </Link>
            </div>
          </div>
        </section>
      </main>
    </SignInProvider>
  );
}
