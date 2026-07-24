"use client";

import { type ReactNode, useState } from "react";
import type { BiasBreakdownRow, InsightsViewModel } from "@/lib/insights/insightsCore";
import { type Verdict, verdictToneLabel } from "@/lib/insights/verdict";
import { Card, CardLabel } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { CalibrationChart } from "./CalibrationChart";
import { ProgressChart } from "./ProgressChart";

type Tab = "calibration" | "progress" | "bias";

interface OverviewProps {
  verdict: Verdict;
  n: number;
  baseline: number;
  runningBrier: number | null;
  bias: InsightsViewModel["bias"];
  boldness: InsightsViewModel["boldness"];
  curve: InsightsViewModel["curve"];
  progress: InsightsViewModel["progress"];
  /** The AI insight card, rendered by the server page and slotted beside the
   *  chart so the two share the main row and fill the width. */
  insightSlot: ReactNode;
}

const TONE_DOT: Record<Verdict["tone"], string> = {
  positive: "bg-success",
  caution: "bg-warning",
  neutral: "bg-ink-tertiary",
  locked: "bg-ink-tertiary",
};

// A low-saturation tinted border on the verdict card — a quiet seasoning of the
// status color, never a filled block. Neutral/locked stay on the default border.
const TONE_CARD: Record<Verdict["tone"], string> = {
  positive: "border-success/30",
  caution: "border-warning/40",
  neutral: "",
  locked: "",
};

function scrollToHistory() {
  if (typeof window === "undefined") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("history")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

function LockStateCard({ sentence }: { sentence: string }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-ink-secondary">
      {sentence}
    </p>
  );
}

/** The boldness gauge, shown alongside the calibration curve (they answer the
 *  same question from two angles: are you calibrated, and do you commit?). */
function BoldnessGauge({ boldness }: { boldness: InsightsViewModel["boldness"] }) {
  if (!boldness.unlocked) return <LockStateCard sentence={boldness.unlockSentence!} />;
  if (boldness.value === null) return <p className="text-sm text-ink-secondary">{boldness.sentence}</p>;

  const fill = Math.round(boldness.value * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <CardLabel as="h3">Boldness</CardLabel>
        <span className="text-2xl font-semibold tabular-nums text-ink">{boldness.value.toFixed(2)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-surface" role="presentation">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${fill}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-wide text-ink-tertiary">
        <span>Hedging</span>
        <span>Informative</span>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">{boldness.sentence}</p>
    </div>
  );
}

function BiasBreakdown({ rows }: { rows: BiasBreakdownRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-5">
      <CardLabel as="h3">By category</CardLabel>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-border-subtle">
              <td className="py-1.5 capitalize text-ink">{row.key.replace(/_/g, " ")}</td>
              <td className="whitespace-nowrap py-1.5 text-right text-ink-tertiary">n={row.n}</td>
              <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-ink">
                {row.bias >= 0 ? "+" : ""}
                {Math.round(row.bias * 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One clickable stat in the KPI strip. Every tile is a real button with the same
 *  hover/focus/keyboard affordances; a chart-linked tile is ringed when its tab is
 *  active, and the "Resolved" tile scrolls to the history instead. */
function Kpi({
  label,
  value,
  onClick,
  active,
}: {
  label: string;
  value: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex flex-col items-center rounded-xl border px-4 py-4 text-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active ? "border-accent bg-accent-tint" : "border-border-subtle hover:border-accent/40 hover:bg-surface",
      )}
    >
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
      <span className="mt-0.5 text-xs text-ink-tertiary">{label}</span>
    </button>
  );
}

export function InsightsOverview({
  verdict,
  n,
  baseline,
  runningBrier,
  bias,
  boldness,
  curve,
  progress,
  insightSlot,
}: OverviewProps) {
  // Default to Progress; fall back to an unlocked tab so the user still opens
  // onto content rather than a lock message. (bias unlocks at 10, progress 25,
  // curve 30.)
  const initialTab: Tab = progress.unlocked ? "progress" : curve.unlocked ? "calibration" : "bias";
  const [tab, setTab] = useState<Tab>(initialTab);

  const tabs: Array<{ key: Tab; label: string; unlocked: boolean }> = [
    { key: "progress", label: "Progress", unlocked: progress.unlocked },
    { key: "calibration", label: "Calibration", unlocked: curve.unlocked },
    { key: "bias", label: "Bias", unlocked: bias.unlocked },
  ];

  const biasValue =
    bias.unlocked && bias.value !== null ? `${bias.value >= 0 ? "+" : ""}${Math.round(bias.value * 100)}` : "—";
  const boldnessValue = boldness.unlocked && boldness.value !== null ? boldness.value.toFixed(2) : "—";

  return (
    <>
      {/* Hero — the verdict (descriptive) + a glanceable KPI strip. Full width. */}
      <Card className={cx("mt-8", TONE_CARD[verdict.tone])}>
        <div className="flex items-start gap-3">
          <span className={cx("mt-2 h-2.5 w-2.5 shrink-0 rounded-full", TONE_DOT[verdict.tone])} aria-hidden />
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              {verdict.headline}
              <span className="sr-only"> — calibration status: {verdictToneLabel(verdict.tone)}</span>
            </h2>
            {verdict.sub && <p className="mt-1 text-sm text-ink-secondary">{verdict.sub}</p>}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Running Brier"
            value={runningBrier !== null ? runningBrier.toFixed(2) : "—"}
            onClick={() => setTab("progress")}
            active={tab === "progress"}
          />
          <Kpi label="Bias score" value={biasValue} onClick={() => setTab("bias")} active={tab === "bias"} />
          <Kpi
            label="Boldness"
            value={boldnessValue}
            onClick={() => setTab("calibration")}
            active={tab === "calibration"}
          />
          <Kpi label="Resolved" value={String(n)} onClick={scrollToHistory} />
        </div>
      </Card>

      {/* The chart is the centre of this page — full width and large. */}
      <Card className="mt-8">
        <div className="inline-flex rounded-lg border border-border p-1 text-sm" role="tablist" aria-label="Chart view">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cx(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  tab === t.key ? "bg-accent text-white" : "text-ink-secondary hover:text-ink",
                )}
              >
                {t.label}
                {!t.unlocked && <span className="ml-1 text-ink-tertiary">🔒</span>}
              </button>
            ))}
          </div>

          {/* key={tab} re-triggers the quiet fade on every switch. */}
          <div key={tab} className="animate-tab-in mt-4">
            {tab === "calibration" && (
              <div>
                <CardLabel>Calibration curve</CardLabel>
                <div className="mt-2">
                  {curve.unlocked ? (
                    <>
                      <CalibrationChart points={curve.points} />
                      <div className="mt-6 border-t border-border-subtle pt-5">
                        <BoldnessGauge boldness={boldness} />
                      </div>
                    </>
                  ) : (
                    <LockStateCard sentence={curve.unlockSentence!} />
                  )}
                </div>
              </div>
            )}

            {tab === "progress" && (
              <div>
                <CardLabel>Progress (Brier over time)</CardLabel>
                <div className="mt-2">
                  {progress.unlocked ? (
                    <>
                      <ProgressChart trend={progress.trend} baseline={baseline} />
                      {progress.sentence && <p className="mt-1 text-sm text-ink-secondary">{progress.sentence}</p>}
                    </>
                  ) : (
                    <LockStateCard sentence={progress.unlockSentence!} />
                  )}
                </div>
              </div>
            )}

            {tab === "bias" && (
              <div>
                <CardLabel>Directional bias</CardLabel>
                <div className="mt-2">
                  {bias.unlocked ? (
                    <>
                      <p className="text-3xl font-semibold tabular-nums text-ink">
                        {bias.value! >= 0 ? "+" : ""}
                        {Math.round(bias.value! * 100)}
                      </p>
                      <p className="mt-2 text-sm text-ink-secondary">{bias.sentence}</p>
                      <BiasBreakdown rows={bias.byCategory} />
                    </>
                  ) : (
                    <LockStateCard sentence={bias.unlockSentence!} />
                  )}
                </div>
              </div>
            )}
          </div>
      </Card>

      {/* AI insight — a prominent, full-width feature directly under the chart. */}
      <div className="mt-8">{insightSlot}</div>
    </>
  );
}
