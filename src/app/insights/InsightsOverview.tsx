"use client";

import { type ReactNode, useId, useState } from "react";
import type { CategoryBiasRow, InsightsViewModel } from "@/lib/insights/insightsCore";
import { type Verdict, verdictToneLabel, verdictTrendSentence } from "@/lib/insights/verdict";
import type { VerdictTrend } from "@/lib/scoring";
import { CalibrationChart } from "./CalibrationChart";
import { ProgressChart } from "./ProgressChart";

/** The recent-window figures (from the "recent" scope) behind each stat's tooltip delta. */
interface RecentDeltas {
  brier: number | null;
  bias: number | null;
  boldness: number | null;
}

interface OverviewProps {
  verdict: Verdict;
  /** The recent-vs-lifetime gap move for the hero sub-line; null below the sample floor. */
  trend: VerdictTrend | null;
  n: number;
  baseline: number;
  runningBrier: number | null;
  bias: InsightsViewModel["bias"];
  boldness: InsightsViewModel["boldness"];
  curve: InsightsViewModel["curve"];
  progress: InsightsViewModel["progress"];
  /** Recent-window values powering the stat-strip tooltips' recent-vs-lifetime deltas. */
  recent: RecentDeltas;
  /** The outcome × stance cross (docs §2.3) — the one decision-layer analytic that ships UI. */
  decisions: InsightsViewModel["decisions"];
  /** The coach's-note (AI insight) block, rendered by the server page. */
  insightSlot: ReactNode;
}

// Plain-language definitions of the three stat-strip figures — one source, reused
// by both the per-figure tooltip and the single "What do these mean?" panel.
const STAT_DEFS = {
  brier: "How closely your confidence tends to track what actually happens.",
  bias: "Whether you tend to run overconfident or underconfident overall.",
  boldness: "Whether your confidence swings high and low or stays cautiously near the middle.",
} as const;

// Below this boldness value the interpretation is loud enough to earn an inline
// line under the strip; above it, the same sentence lives in the tooltip. The
// page gets louder only where the data is notable.
const BOLDNESS_INLINE_MAX = 0.05;

function fmtBrier(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

function fmtBiasPoints(v: number | null): string {
  if (v === null) return "—";
  const pts = Math.round(v * 100);
  return `${pts >= 0 ? "+" : ""}${pts}`;
}

function fmtBoldness(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

/** "0.35 recent · 0.31 lifetime" — omitted entirely when neither value is readable. */
function deltaLine(recent: number | null, lifetime: number | null, fmt: (v: number | null) => string): string | null {
  if (recent === null && lifetime === null) return null;
  return `${fmt(recent)} recent · ${fmt(lifetime)} lifetime`;
}

/** Wrap every "NN%" in the headline in the accent colour — presentation only, so
 *  the sentence itself stays authored in one place (verdict.ts). */
function AccentPercents({ text }: { text: string }) {
  const parts = text.split(/(\d+%)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\d+%$/.test(part) ? (
          <span key={i} className="text-accent">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** A focusable info affordance: an "i" that reveals its tooltip on hover AND focus. */
function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold leading-none text-ink-tertiary transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-canvas px-3 py-2 text-left text-xs font-normal leading-snug text-ink-secondary shadow-[var(--shadow-card)] group-hover/tip:block group-focus-within/tip:block"
      >
        {children}
      </span>
    </span>
  );
}

/** One label-over-number figure in the stat strip. */
function StatFigure({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
        {label}
        <InfoTip label={`About ${label}`}>{tip}</InfoTip>
      </span>
      <span className="mt-1 text-3xl font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** The verdict hero — the page's largest voice, no box. */
function VerdictHero({ verdict, trend, n }: { verdict: Verdict; trend: VerdictTrend | null; n: number }) {
  return (
    <section className="mx-auto max-w-[42rem] text-center">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-tertiary">
        Insights · {n} resolved
      </p>
      <h2 className="mt-3 text-[27px] font-medium leading-snug tracking-tight text-ink sm:text-[30px]">
        <AccentPercents text={verdict.headline} />
        <span className="sr-only"> — calibration status: {verdictToneLabel(verdict.tone)}</span>
      </h2>
      {verdict.sub && <p className="mt-3 text-base text-ink-secondary">{verdict.sub}</p>}
      {/* Below the sample floor `trend` is null — the sub-line is omitted, never a placeholder. */}
      {trend && <p className="mt-1.5 text-sm text-ink-tertiary">{verdictTrendSentence(trend)}</p>}
    </section>
  );
}

/** The stat strip — three figures between two hairline rules. */
function StatStrip({
  runningBrier,
  bias,
  boldness,
  recent,
}: {
  runningBrier: number | null;
  bias: OverviewProps["bias"];
  boldness: OverviewProps["boldness"];
  recent: RecentDeltas;
}) {
  const [defsOpen, setDefsOpen] = useState(false);
  const defsId = useId();

  const biasValue = bias.unlocked ? fmtBiasPoints(bias.value) : "—";
  const boldnessValue = boldness.unlocked ? fmtBoldness(boldness.value) : "—";

  const brierDelta = deltaLine(recent.brier, runningBrier, fmtBrier);
  const biasDelta = deltaLine(recent.bias, bias.value, fmtBiasPoints);
  const boldnessDelta = deltaLine(recent.boldness, boldness.value, fmtBoldness);

  // Boldness interpretation: inline (a muted line under the strip) only when it's
  // notably low; otherwise it rides in the tooltip. `boldness.sentence` also
  // carries the degenerate all-same-outcome explanation.
  const boldnessInline =
    boldness.unlocked && boldness.value !== null && boldness.value < BOLDNESS_INLINE_MAX
      ? boldness.sentence
      : null;
  const boldnessTip =
    boldness.sentence && !boldnessInline ? boldness.sentence : null;

  return (
    <section className="mx-auto mt-10 max-w-3xl">
      <div className="grid grid-cols-3 gap-4 border-y border-border py-5">
        <StatFigure
          label="Running Brier"
          value={fmtBrier(runningBrier)}
          tip={
            <>
              {STAT_DEFS.brier}
              {brierDelta && <span className="mt-1 block text-ink-tertiary">{brierDelta}</span>}
            </>
          }
        />
        <StatFigure
          label="Bias"
          value={biasValue}
          tip={
            <>
              {STAT_DEFS.bias}
              {biasDelta && <span className="mt-1 block text-ink-tertiary">{biasDelta}</span>}
            </>
          }
        />
        <StatFigure
          label="Boldness"
          value={boldnessValue}
          tip={
            <>
              {STAT_DEFS.boldness}
              {boldnessTip && <span className="mt-1 block text-ink-secondary">{boldnessTip}</span>}
              {boldnessDelta && <span className="mt-1 block text-ink-tertiary">{boldnessDelta}</span>}
            </>
          }
        />
      </div>

      {/* Conditional prominence: a loud-enough boldness reading gets its own line. */}
      {boldnessInline && <p className="mt-2 text-center text-sm text-ink-tertiary">{boldnessInline}</p>}

      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => setDefsOpen((o) => !o)}
          aria-expanded={defsOpen}
          aria-controls={defsId}
          className="text-xs text-ink-tertiary underline-offset-2 hover:text-ink hover:underline"
        >
          What do these mean?
        </button>
        {defsOpen && (
          <dl id={defsId} className="mx-auto mt-3 max-w-md space-y-2 text-left text-xs text-ink-secondary">
            <div>
              <dt className="font-medium text-ink">Running Brier</dt>
              <dd className="text-ink-tertiary">{STAT_DEFS.brier}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Bias</dt>
              <dd className="text-ink-tertiary">{STAT_DEFS.bias}</dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Boldness</dt>
              <dd className="text-ink-tertiary">{STAT_DEFS.boldness}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

/** A locked chart's honest "N more" state — dashed, no card chrome. */
function ChartLock({ sentence }: { sentence: string }) {
  return (
    <p className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border p-6 text-center text-sm text-ink-secondary">
      {sentence}
    </p>
  );
}

/** One chart in the evidence band: a 13px title, a muted one-line sub-label, then
 *  the chart itself — no box. */
function EvidencePanel({
  title,
  subLabel,
  children,
}: {
  title: string;
  subLabel: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
      <p className="text-xs text-ink-tertiary">{subLabel}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** The evidence band — both charts side by side, full container width, one shared caption. */
function EvidenceBand({
  baseline,
  curve,
  progress,
}: {
  baseline: number;
  curve: OverviewProps["curve"];
  progress: OverviewProps["progress"];
}) {
  return (
    <section className="mt-14">
      <div className="grid gap-x-10 gap-y-10 md:grid-cols-2">
        <EvidencePanel title="Progress" subLabel="Your Brier over time — lower is better.">
          {progress.unlocked ? (
            <ProgressChart trend={progress.trend} baseline={baseline} />
          ) : (
            <ChartLock sentence={progress.unlockSentence!} />
          )}
        </EvidencePanel>

        <EvidencePanel title="Calibration curve" subLabel="Your stated confidence vs. how often it happened.">
          {curve.unlocked ? (
            <CalibrationChart points={curve.points} />
          ) : (
            <ChartLock sentence={curve.unlockSentence!} />
          )}
        </EvidencePanel>
      </div>

      {/* One shared interpretive caption for the pair, not one each. */}
      {curve.caption && (
        <p className="mx-auto mt-6 max-w-[42rem] text-center text-sm text-ink-secondary">{curve.caption}</p>
      )}
    </section>
  );
}

/** One row of the category breakdown — label, proportional bar, signed bias, and
 *  the per-category detail line. */
function CategoryRow({ row, maxAbs }: { row: CategoryBiasRow; maxAbs: number }) {
  const width = maxAbs === 0 ? 0 : (Math.abs(row.bias) / maxAbs) * 100;
  const points = Math.round(row.bias * 100);
  return (
    <div className="border-t border-border-subtle py-3">
      <div className="flex items-center gap-4">
        <span className="w-28 shrink-0 truncate capitalize text-sm text-ink">{row.key.replace(/_/g, " ")}</span>
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface" role="presentation">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${width}%`, opacity: 0.45 + 0.55 * (maxAbs === 0 ? 0 : Math.abs(row.bias) / maxAbs) }}
          />
        </span>
        <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink">
          {points >= 0 ? "+" : ""}
          {points}
          <span className="ml-0.5 text-xs text-ink-tertiary">pts</span>
        </span>
      </div>
      <p className="mt-1 pl-32 text-xs text-ink-tertiary">
        n={row.n} · says {Math.round(row.meanConfidence * 100)}% · lands {Math.round(row.hitRate * 100)}%
      </p>
    </div>
  );
}

/** "Where the overconfidence lives" — the per-category breakdown. */
function CategoryBreakdown({ bias }: { bias: OverviewProps["bias"] }) {
  const rows = bias.byCategory;
  const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.bias)), 0);

  return (
    <section className="mt-14">
      <h3 className="text-sm font-semibold text-ink">Where the overconfidence lives</h3>
      {!bias.unlocked ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-ink-secondary">
          {bias.unlockSentence}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-tertiary">No category breakdown yet — your resolutions aren’t categorized.</p>
      ) : (
        <div className="mt-3">
          {rows.map((row) => (
            <CategoryRow key={row.key} row={row} maxAbs={maxAbs} />
          ))}
        </div>
      )}
    </section>
  );
}

/** "Decisions" — the outcome × stance cross (docs §2.3), the only rendered
 *  decision-layer analytic (`byEntryType` ships built and tested, unrendered).
 *  Reports frequencies of the user's own stance answers and stops — it never
 *  says whether standing by, or not, was the right call (CLAUDE.md copy rule).
 *  No per-type (decision-vs-forecast) breakdown is rendered here or anywhere. */
function DecisionsSection({ decisions }: { decisions: OverviewProps["decisions"] }) {
  return (
    <section className="mt-14">
      <h3 className="text-sm font-semibold text-ink">Decisions</h3>
      {!decisions.unlocked ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-ink-secondary">
          {decisions.unlockSentence}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-secondary">{decisions.sentence}</p>
          <p className="mt-1 text-xs text-ink-tertiary">
            Outcome and satisfaction are recorded separately — this shows how they relate for you.
          </p>
        </>
      )}
    </section>
  );
}

export function InsightsOverview({
  verdict,
  trend,
  n,
  baseline,
  runningBrier,
  bias,
  boldness,
  curve,
  progress,
  recent,
  decisions,
  insightSlot,
}: OverviewProps) {
  return (
    <div className="mt-10">
      <VerdictHero verdict={verdict} trend={trend} n={n} />
      <StatStrip runningBrier={runningBrier} bias={bias} boldness={boldness} recent={recent} />
      <EvidenceBand baseline={baseline} curve={curve} progress={progress} />
      {/* Coach's note — the AI insight, the only element with a solid accent
          border (the page title carries a fainter accent rule). */}
      <div className="mx-auto mt-14 max-w-[42rem]">{insightSlot}</div>
      <CategoryBreakdown bias={bias} />
      <DecisionsSection decisions={decisions} />
    </div>
  );
}
