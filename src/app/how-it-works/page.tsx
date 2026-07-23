import type { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { ONBOARDING_TEMPLATES } from "@/lib/onboarding/templates";
import { ScoreDemo } from "./ScoreDemo";
import { CurveDemo } from "./CurveDemo";
import { MarkSeen } from "./MarkSeen";

export const metadata = {
  title: "How it works · Calra",
  description:
    "What calibration is, why your gut is probably overconfident, and how Calra measures it — in plain language.",
};

// A section wrapper: an eyebrow label, a heading, and the body. Keeps the
// vertical rhythm identical down the whole page.
function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border-subtle pt-14">
      <CardLabel as="p" className="text-accent">
        {eyebrow}
      </CardLabel>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// Progressive disclosure — native <details>, so it needs no client JS and stays
// skimmable for the impatient, deep for the curious.
function Why({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group mt-6 rounded-xl border border-border bg-surface p-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-ink">
        {question}
        <span className="shrink-0 text-ink-tertiary transition-transform group-open:rotate-90">
          →
        </span>
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-ink-secondary">{children}</div>
    </details>
  );
}

const LOOP_STEPS = [
  {
    step: "1",
    title: "Predict",
    body: "Write what you think will happen, in your own words. Attach a confidence — say, 75% — and the date you'll know the answer.",
  },
  {
    step: "2",
    title: "Resolve",
    body: "When that date arrives, we nudge you. You mark what actually happened: yes or no. Your original reasoning stays frozen — no rewriting history.",
  },
  {
    step: "3",
    title: "Score",
    body: "Plain math — never a guess, never AI — turns that prediction and outcome into an exact number for how good the call was.",
  },
  {
    step: "4",
    title: "Adjust",
    body: "Do it enough times and the pattern surfaces: where your gut is sharp, and where your confidence runs ahead of reality. Then you recalibrate.",
  },
];

const UNLOCKS = [
  {
    n: "~10",
    title: "Your bias score",
    body: "The first real read: a single number like “you run 12 points overconfident,” telling you which direction your gut leans and by how much.",
  },
  {
    n: "~25",
    title: "Your progress chart",
    body: "Your score over time, so you can watch whether the training is actually working — your recent calls compared against your lifetime average.",
  },
  {
    n: "~30",
    title: "Your calibration curve",
    body: "The full picture: your confidence plotted against reality across every level. It needs the most data because a curve from a handful of predictions is just noise.",
  },
];

export default async function HowItWorksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Header />
      <MarkSeen />
      <main className="flex flex-1 justify-center px-6 py-10">
        <div className="w-full max-w-3xl">
          {/* Hero */}
          <p className="text-sm font-medium text-accent">How it works</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">
            Find out if your gut is actually right.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-secondary">
            You make judgment calls every day — this will ship on time, that hire will work out, I&apos;ll
            stick with the gym this year. Calra is a simple loop for checking, over time, which of
            those calls you can actually trust. No math required from you. Here&apos;s the whole idea.
          </p>

          <div className="mt-16 flex flex-col gap-16">
            {/* The problem */}
            <Section eyebrow="The problem" title="We&apos;re bad at knowing how much we know">
              <p className="text-base leading-relaxed text-ink-secondary">
                Think of the last time you were <span className="font-medium text-ink">sure</span> —
                &ldquo;I&apos;m 90% certain we&apos;ll close this by Friday.&rdquo; Now think about how
                often that kind of &ldquo;90% certain&rdquo; actually pans out. For almost everyone,
                the honest answer is: a lot less than 90% of the time.
              </p>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                That gap is invisible, and it stays invisible, for one reason: we don&apos;t keep
                track. After the fact, memory quietly rewrites itself — &ldquo;I always knew that was
                a stretch&rdquo; — and the lesson evaporates. The only fix is almost embarrassingly
                simple: <span className="font-medium text-ink">write the prediction down, with a
                number, before you know the answer.</span> That&apos;s the entire mechanic here.
              </p>
              <Why question="Is this just me, or is everyone like this?">
                It&apos;s remarkably universal — decades of research find that people are
                systematically overconfident, and it barely correlates with intelligence or
                expertise. The good news buried in that research: it&apos;s a{" "}
                <span className="font-medium text-ink">trainable skill</span>, not a fixed trait.
                Weather forecasters, who get scored feedback every single day, end up among the
                best-calibrated people on earth. This app is a machine for giving you that same kind
                of feedback.
              </Why>
            </Section>

            {/* The idea */}
            <Section
              eyebrow="The key idea"
              title="A probability is a claim about many cases, not one event"
            >
              <p className="text-base leading-relaxed text-ink-secondary">
                This is the one concept everything rests on, and most people have never had it spelled
                out. Picture a weather forecaster who says{" "}
                <span className="font-medium text-ink">&ldquo;70% chance of rain&rdquo;</span>. What
                would make that a <em>good</em> forecast?
              </p>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                Not whether it rains today. A &ldquo;70% chance&rdquo; isn&apos;t a promise that it
                will rain — it&apos;s a claim that <span className="font-medium text-ink">on days
                like this, it rains about 7 times out of 10</span>. So the forecaster is exactly right
                if, across all the days she says &ldquo;70%,&rdquo; it rains on roughly 70% of them.
                The 3-in-10 dry days aren&apos;t her being wrong — they&apos;re her forecast{" "}
                <em>coming true</em>. Thirty percent of the time, it was supposed to stay dry.
              </p>
              <p className="mt-4 text-base leading-relaxed text-ink-secondary">
                So no single prediction can be &ldquo;calibrated&rdquo; or not — only a whole track
                record can. That&apos;s why Calra needs a bit of history before it can tell you
                anything, and why it gets sharper the longer you use it.
              </p>
              <Why question="Then how can one prediction ever be scored?">
                A single prediction still gets an exact score for how close it landed to reality (that&apos;s
                the next section). What a single prediction <em>can&apos;t</em> tell you is whether
                your <em>70%</em> really means 70% — that judgment only emerges once you&apos;ve made
                many of them and we can check: of all your &ldquo;70%&rdquo; calls, how many came
                true? Individual scores measure accuracy; the pattern across them measures
                calibration.
              </Why>
            </Section>

            {/* The loop */}
            <Section eyebrow="The loop" title="Four steps, repeated">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {LOOP_STEPS.map((s) => (
                  <Card key={s.step} as="div">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint font-mono text-sm font-semibold text-accent">
                      {s.step}
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink">{s.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{s.body}</p>
                  </Card>
                ))}
              </div>
            </Section>

            {/* Interactive: what a score is */}
            <Section eyebrow="Try it" title="What a score actually looks like">
              <p className="text-base leading-relaxed text-ink-secondary">
                When a prediction resolves, we measure one thing:{" "}
                <span className="font-medium text-ink">how far your confidence was from what
                happened</span>. That&apos;s the score (its formal name is a <em>Brier score</em>, but
                you never need the name). Drag the slider and watch it move.
              </p>
              <Card className="mt-6">
                <ScoreDemo />
              </Card>
            </Section>

            {/* What the numbers mean */}
            <Section eyebrow="What you&apos;ll see" title="The three numbers, in plain terms">
              <div className="flex flex-col gap-4">
                <Card as="div">
                  <h3 className="text-base font-semibold text-ink">The score (Brier)</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                    How close your predictions land to reality, on average.{" "}
                    <span className="font-medium text-ink">Lower is better</span>, like golf. A score
                    of <span className="font-mono text-ink">0.25</span> is the &ldquo;I&apos;m just
                    guessing&rdquo; baseline — what you&apos;d get by shrugging &ldquo;50/50&rdquo; at
                    everything. Beating it means your confidence carries real information.
                  </p>
                </Card>
                <Card as="div">
                  <h3 className="text-base font-semibold text-ink">The bias score</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                    Which way you lean, and by how much. &ldquo;You run{" "}
                    <span className="font-medium text-ink">12 points overconfident</span>&rdquo; means
                    that, on average, reality came in 12 percentage points below your stated
                    confidence. A negative version means you&apos;re too cautious.
                  </p>
                </Card>
                <Card as="div">
                  <h3 className="text-base font-semibold text-ink">The calibration curve</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                    The whole picture in one chart: your confidence along the bottom, how often
                    things actually happened up the side. Dots{" "}
                    <span className="font-medium text-ink">below the diagonal line mean
                    overconfident</span>; above it means underconfident; on it means spot-on. Flip
                    between the three shapes below.
                  </p>
                </Card>
              </div>
              <Card className="mt-4">
                <CurveDemo />
              </Card>
            </Section>

            {/* What unlocks when */}
            <Section eyebrow="Honest expectations" title="What you&apos;ll see, and when">
              <p className="text-base leading-relaxed text-ink-secondary">
                Because calibration is about patterns, the richer read-outs need a bit of data before
                they mean anything — we&apos;d rather show you nothing than show you noise. You&apos;ll
                get an exact score on your very first resolution; the bigger pictures arrive as you
                go:
              </p>
              <ol className="mt-6 flex flex-col gap-4">
                {UNLOCKS.map((u) => (
                  <li key={u.title} className="flex gap-4">
                    <span className="mt-0.5 shrink-0 rounded-lg bg-surface px-3 py-1.5 font-mono text-sm font-semibold text-accent">
                      {u.n}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-ink">{u.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">{u.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-sm text-ink-tertiary">
                Until each one unlocks, we show you exactly how many resolutions are left — never a
                blank or a misleading half-picture.
              </p>
            </Section>

            {/* CTA */}
            <section className="border-t border-border-subtle pt-14">
              <h2 className="text-2xl font-semibold tracking-tight text-ink">
                Make your first prediction
              </h2>
              <p className="mt-3 text-base leading-relaxed text-ink-secondary">
                The whole loop starts with one call about something you actually care about. It takes
                about thirty seconds.
              </p>
              <div className="mt-6">
                <Link
                  href={user ? "/predictions/new" : "/login"}
                  className={buttonVariants("primary", { size: "md", className: "text-base" })}
                >
                  {user ? "Make your first prediction →" : "Get started →"}
                </Link>
              </div>

              {user && (
                <div className="mt-8">
                  <CardLabel as="p">Or start from an example — you can edit it</CardLabel>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {ONBOARDING_TEMPLATES.map((t) => (
                      <Link
                        key={t.key}
                        href={`/predictions/new?template=${t.key}`}
                        className="rounded-xl border border-border px-4 py-2 text-left transition-colors hover:bg-surface"
                      >
                        <span className="block text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                          {t.label}
                        </span>
                        <span className="mt-0.5 block text-sm text-ink">{t.text}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
