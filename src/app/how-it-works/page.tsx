import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HOW_IT_WORKS, type Section as SectionCopy, type Why as WhyCopy } from "@/lib/content/howItWorks";
import { Card, CardLabel } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { ONBOARDING_TEMPLATES } from "@/lib/onboarding/templates";
import { ScoreDemo } from "./ScoreDemo";
import { CurveDemo } from "./CurveDemo";
import { BoldnessDemo } from "./BoldnessDemo";
import { MarkSeen } from "./MarkSeen";

export const metadata = {
  title: "How it works · Ivyra",
  description: HOW_IT_WORKS.metaDescription,
};

// Render **double-asterisk** spans as bold; everything else stays plain. Lets the
// copy live as testable strings in the content module while keeping emphasis.
function emphasize(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="font-medium text-ink">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

// A section wrapper: an eyebrow label, a heading, and the body — one consistent
// vertical rhythm down the whole page.
function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-14">
      <CardLabel as="p" className="text-accent">
        {eyebrow}
      </CardLabel>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Paragraphs({ items }: { items: string[] }) {
  return (
    // Prose fills the same content width as the section headings, callout boxes,
    // and cards it sits among, so text lines don't end short of the boxes beside
    // them (the page container's max-w-5xl is the shared measure).
    <div className="flex flex-col gap-4">
      {items.map((p, i) => (
        <p key={i} className="text-base leading-relaxed text-ink-secondary">
          {emphasize(p)}
        </p>
      ))}
    </div>
  );
}

// Progressive disclosure — native <details>, no client JS. Skimmable for the
// impatient, deep for the curious.
function Why({ why }: { why: WhyCopy }) {
  return (
    <details className="group mt-6 rounded-xl border border-border bg-surface p-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-medium text-ink">
        {why.question}
        <span className="shrink-0 text-ink-tertiary transition-transform group-open:rotate-90">→</span>
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-ink-secondary">{emphasize(why.answer)}</div>
    </details>
  );
}

// A plain prose section straight from the content module.
function ProseSection({ copy, children }: { copy: SectionCopy; children?: ReactNode }) {
  return (
    <Section eyebrow={copy.eyebrow} title={copy.title}>
      <Paragraphs items={copy.paragraphs} />
      {children}
      {copy.why && <Why why={copy.why} />}
    </Section>
  );
}

export default async function HowItWorksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const c = HOW_IT_WORKS;

  return (
    <>
      <Header showGetStarted />
      <MarkSeen />
      <main className="page-gradient flex flex-1 justify-center px-6 py-10 lg:px-8">
        <div className="w-full max-w-5xl">
          {/* Hero */}
          <p className="text-sm font-medium text-accent">How it works</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{c.hero.headline}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-secondary">{c.hero.sub}</p>

          <div className="mt-16 flex flex-col gap-16">
            <ProseSection copy={c.problem} />
            <ProseSection copy={c.keyIdea} />

            {/* The loop — a connected visual sequence (→ across, ↓ when stacked). */}
            <Section eyebrow={c.loop.eyebrow} title={c.loop.title}>
              <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                {c.loop.steps.map((s, i) => (
                  <Fragment key={s.step}>
                    <li className="flex-1">
                      <Card as="div" className="h-full">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-tint font-mono text-sm font-semibold text-accent">
                          {s.step}
                        </div>
                        <h3 className="mt-4 text-base font-semibold text-ink">{s.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{s.body}</p>
                      </Card>
                    </li>
                    {i < c.loop.steps.length - 1 && (
                      <li aria-hidden className="flex items-center justify-center text-ink-tertiary">
                        <span className="sm:hidden">↓</span>
                        <span className="hidden sm:inline">→</span>
                      </li>
                    )}
                  </Fragment>
                ))}
              </ol>
              <p className="mt-4 text-sm text-ink-tertiary">…and then back to the top, for the next call.</p>
            </Section>

            {/* Your score + live Brier demo */}
            <ProseSection copy={c.score}>
              <Card className="mt-6">
                <ScoreDemo />
              </Card>
            </ProseSection>

            <ProseSection copy={c.bias} />

            {/* Your curve + shape demo */}
            <ProseSection copy={c.curve}>
              <Card className="mt-6">
                <CurveDemo />
              </Card>
            </ProseSection>

            {/* Boldness — the flagship new concept + separation demo */}
            <ProseSection copy={c.boldness}>
              <Card className="mt-6">
                <BoldnessDemo />
              </Card>
            </ProseSection>

            <ProseSection copy={c.verdictInsight} />
            <ProseSection copy={c.scope} />

            {/* Why some things unlock later */}
            <Section eyebrow={c.unlocks.eyebrow} title={c.unlocks.title}>
              <p className="text-base leading-relaxed text-ink-secondary">{emphasize(c.unlocks.intro)}</p>
              <ol className="mt-6 flex flex-col gap-4">
                {c.unlocks.items.map((u) => (
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
              <p className="mt-6 text-sm text-ink-tertiary">{c.unlocks.footnote}</p>
            </Section>

            {/* Trust — computed vs. written. Given a soft-accent callout so the
                point lands. */}
            <Section eyebrow={c.trust.eyebrow} title={c.trust.title}>
              <Card as="div" className="border-accent/30 bg-accent-tint/40">
                <Paragraphs items={c.trust.paragraphs} />
              </Card>
            </Section>

            {/* CTA */}
            <section className="border-t border-border-subtle pt-14">
              <h2 className="text-xl font-semibold tracking-tight text-ink">{c.cta.title}</h2>
              <p className="mt-3 text-base leading-relaxed text-ink-secondary">{c.cta.body}</p>
              <div className="mt-6">
                <Link
                  href={user ? "/predictions/new" : "/?signin=1"}
                  className={buttonVariants("primary", { size: "md", className: "text-base" })}
                >
                  {user ? "Make your first decision →" : "Get started →"}
                </Link>
              </div>

              {user && (
                <div className="mt-8">
                  <CardLabel as="p">{c.cta.templatesIntro}</CardLabel>
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
