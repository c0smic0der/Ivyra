import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CalibrationChart } from "@/app/insights/CalibrationChart";
import type { CalibrationPoint } from "@/lib/insights/insightsCore";
import { Card, CardLabel } from "@/components/ui/Card";
import { BrandMark } from "@/components/BrandMark";
import { SignInButton, SignInProvider } from "@/components/auth/SignIn";

// Marketing sample only — empty `predictions` makes the chart's drill-down
// self-disable, so this renders as a static curve with no click affordance.
const SAMPLE_POINTS: CalibrationPoint[] = [
  { x: 0.2, y: 0.22, n: 5, low: 0.2, high: 0.3, predictions: [] },
  { x: 0.4, y: 0.35, n: 8, low: 0.4, high: 0.5, predictions: [] },
  { x: 0.6, y: 0.5, n: 11, low: 0.6, high: 0.7, predictions: [] },
  { x: 0.8, y: 0.63, n: 9, low: 0.8, high: 0.9, predictions: [] },
  { x: 0.95, y: 0.72, n: 6, low: 0.9, high: 1, predictions: [] },
];

// --- the hero "screenshot": a static render of the journal timeline (§3.2) ----
// The point of showing it here is that the register is a journal — dated entries
// in the user's own words — while the mechanics stay unmistakable: each entry
// carries a claim, a confidence, and the reasoning behind it, with the score as
// the annotation on the right. No promise of free-form writing: every entry is a
// decision.
type MockEntry = {
  day: string;
  claim: string;
  reasoning: string;
  annotation: React.ReactNode;
};

const MOCK_ENTRIES: MockEntry[] = [
  {
    day: "28 Jul",
    claim: "We ship the redesign by the 15th",
    reasoning: "Third week with no assets and I'm starting to think this isn't a delay so much as the plan…",
    annotation: <span className="text-ink-tertiary">80% · resolves 15/8</span>,
  },
  {
    day: "21 Jul",
    claim: "They come back with a better offer by end of month",
    reasoning: "Said 75%. They didn't come back at all. I keep pricing hope as if it were evidence…",
    annotation: (
      <span className="inline-flex items-center gap-1 text-ink-tertiary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger" aria-hidden>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        0.64
      </span>
    ),
  },
  {
    day: "14 Jul",
    claim: "Review time drops below a day within a month of the trunk-based switch",
    reasoning: "The bottleneck was always batching, and small PRs merge on their own…",
    annotation: (
      <span className="inline-flex items-center gap-1 text-ink-tertiary">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        0.09
      </span>
    ),
  },
];

function JournalTimelineMock() {
  return (
    <Card as="div" className="animate-fade-up">
      <div className="flex items-center justify-between">
        <CardLabel>Your journal</CardLabel>
        <span className="rounded-full bg-accent-tint px-2 py-0.5 text-[10px] font-medium text-accent">
          Newest first
        </span>
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-tertiary">July</p>
      <div className="mt-2 divide-y divide-border-subtle">
        {MOCK_ENTRIES.map((e) => (
          <div key={e.day} className="py-3">
            <div className="flex items-baseline justify-between gap-4 text-xs tabular-nums">
              <span className="text-ink-tertiary">{e.day}</span>
              {e.annotation}
            </div>
            <p className="mt-1 text-[13px] leading-snug text-ink">{e.claim}</p>
            <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-ink-tertiary">{e.reasoning}</p>
          </div>
        ))}
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
        A bare number doesn&apos;t teach — which is exactly why Ivyra never stops at one.
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
      {/* Landing-only top bar: brand + the single CTA. "How it works" is a quiet
          text link, not a competing button. */}
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 w-full max-w-5xl items-center justify-between gap-4 px-6">
          <span className="flex items-center gap-2.5">
            <BrandMark className="h-8 w-8 shrink-0" />
            <span className="font-wordmark text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Ivyra<span className="text-accent">.</span>
            </span>
          </span>
          <div className="flex items-center gap-4 sm:gap-5">
            <Link href="/how-it-works" className="text-sm text-ink-secondary transition-colors hover:text-ink">
              How it works
            </Link>
            <div className="relative">
              <SignInButton size="md">Get started →</SignInButton>
              <p className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-tertiary">
                No passwords, just a magic link
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center">
        {/* HERO — journal sentence as headline; calibration as the subline
            immediately beneath (docs/04 §1 hero pattern). Calibration is the
            product; the journal is its shape. */}
        <section className="w-full bg-gradient-to-b from-accent-tint/60 to-transparent">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-2 lg:pb-24 lg:pt-14">
            <div className="animate-fade-up">
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
                A decision journal that scores your expectations against real outcomes.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-secondary">
                Every entry pairs a decision with a checkable success criterion. When it resolves,
                deterministic scoring shows exactly how your stated confidence tracked what actually
                happened.
              </p>
              <div className="mt-8">
                <SignInButton className="text-base">Get started — it&apos;s free</SignInButton>
              </div>
            </div>

            <div className="lg:pl-6">
              <JournalTimelineMock />
            </div>
          </div>
        </section>

        {/* IDENTITY — the corrected §2 sentence, standing on its own. */}
        <section className="w-full px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xl font-medium leading-relaxed text-ink sm:text-2xl">
              Ivyra measures whether your confidence means what you think it does — and shows you
              exactly where it doesn&apos;t.
            </p>
          </div>
        </section>

        {/* ── PRIMARY: CALIBRATION ─────────────────────────────────────────── */}

        {/* A. Know when to trust your own confidence — the frequency gap. */}
        <section className="w-full bg-surface px-6 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <CardLabel as="p" className="text-accent">
                Know when to trust yourself
              </CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Turn &ldquo;I&apos;m pretty sure&rdquo; into a number you can check
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                Ivyra counts how often your calls land at each confidence level. So &ldquo;I&apos;m
                85% sure&rdquo; stops being a feeling and becomes a frequency — one you can hold up
                against reality, call after call.
              </p>
            </div>
            <Card as="div">
              <CardLabel>Your calibration, in one line</CardLabel>
              <p className="mt-3 text-2xl font-semibold leading-snug text-ink">
                When you say 85%, it happens{" "}
                <span className="text-accent">38%</span> of the time.
              </p>
              <div className="mt-5">
                <div className="flex justify-between text-[10px] uppercase tracking-wide text-ink-tertiary">
                  <span>Underconfident</span>
                  <span>Overconfident</span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-surface">
                  <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
                  <div className="absolute left-1/2 top-0 h-full rounded-full bg-accent" style={{ width: "34%" }} />
                </div>
                <p className="mt-2 text-xs text-ink-tertiary">
                  <span className="font-medium text-ink">+47 points</span> overconfident — your
                  high-confidence calls land less often than you claim.
                </p>
              </div>
            </Card>
          </div>
        </section>

        {/* B. The calibration curve — the whole picture across confidence levels. */}
        <section className="w-full px-6 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div className="lg:order-2">
              <CardLabel as="p" className="text-accent">
                The calibration curve
              </CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                See it across every confidence level
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                Each dot groups the calls you made at a similar confidence, then plots that
                confidence against how often those calls actually came true.
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
                    <span className="font-medium text-ink">Dots below the line</span> mean it
                    happened less often than you said; above means more often.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <LegendDot className="mt-1 bg-ink-tertiary/40" />
                  <span>The closer your dots hug the diagonal, the more your confidence can be trusted.</span>
                </li>
              </ul>
            </div>

            <div className="lg:order-1">
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

        {/* C. The track-record panel — a frequency BEFORE you commit. */}
        <section className="w-full bg-surface px-6 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <CardLabel as="p" className="text-accent">
                Before you commit
              </CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Your own track record, at the moment you decide
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                As you write a new entry, Ivyra finds the calls you&apos;ve made like it before and
                shows how they actually turned out — a plain frequency, surfaced before you lock in
                your confidence. It states what happened and stops there.
              </p>
            </div>
            <div>
              <div className="rounded-xl border border-accent/25 bg-accent-tint px-4 py-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Before you save</p>
                <p className="mt-1 text-base text-ink">
                  You&apos;ve said 75% or higher on 6 calls like this. 2 landed.
                </p>
              </div>
              <p className="mt-2 text-center text-xs text-ink-tertiary">
                The only read that fires before a call, not after it.
              </p>
            </div>
          </div>
        </section>

        {/* ── SECONDARY: THE RECORD ────────────────────────────────────────── */}

        {/* D. It reads back like a journal — the register, with a real entry. */}
        <section className="w-full px-6 py-16">
          <div className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <CardLabel as="p">The record</CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                It reads back like a journal
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                Every entry pairs a decision with a checkable success criterion, in your own words —
                the choice, your confidence in how it plays out, and why you believed it — frozen the
                moment you save. Months later it&apos;s a timeline of your thinking, honest because
                the score won&apos;t let it drift.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-tertiary">
                Not a blank page — every entry is a decision, anchored to a criterion you can check.
                The reasoning is optional: a sentence or a paragraph, and it&apos;s the part
                you&apos;ll read back.
              </p>
            </div>

            {/* A real example entry: claim, confidence, reasoning — mechanics unmistakable. */}
            <Card as="div">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-xs tabular-nums text-ink-tertiary">28 Jul</span>
                <span className="text-xs tabular-nums text-ink-tertiary">80% · resolves 15 Aug</span>
              </div>
              <p className="mt-2 text-base font-medium text-ink">We ship the redesign by the 15th</p>
              <div className="mt-3 rounded-lg border border-border-subtle bg-surface p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">Why I think so</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                  Third week with no assets and I&apos;m starting to think this isn&apos;t a delay so
                  much as the plan. Still, the team has pulled these in before — I want that to be
                  true, so maybe I&apos;m giving it more weight than I should.
                </p>
              </div>
              <p className="mt-3 text-xs text-ink-tertiary">Locks when you save.</p>
            </Card>
          </div>
        </section>

        {/* GROUNDED IN RESEARCH */}
        <section className="w-full bg-surface px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <CardLabel as="p">Grounded in research</CardLabel>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Built on what the research shows works
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-secondary">
                The loop Ivyra runs — make a call, see what happens, get a real score, adjust — is one
                of the most studied ways to improve calibration. A few of the findings we built on:
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
              teach on its own, Ivyra pairs every number with plain-language interpretation.
            </p>
          </div>
        </section>

        {/* FINAL CTA — the single call to action. */}
        <section className="w-full px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Start your track record today
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
              It takes about a minute to log your first entry. In a few weeks, you&apos;ll know
              something about yourself most people never do: how often your confidence matches what
              actually happens.
            </p>
            <div className="mt-8 flex justify-center">
              <SignInButton className="text-base">Get started — it&apos;s free</SignInButton>
            </div>
          </div>
        </section>
      </main>
    </SignInProvider>
  );
}
