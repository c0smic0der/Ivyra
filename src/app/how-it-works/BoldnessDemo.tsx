"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

// Shows the boldness idea directly: each dot is one prediction placed by the
// confidence it was given (left = low, right = high) and coloured by what
// happened (green = it did, red = it didn't). The hedger's dots pile up in the
// middle with the colours all mixed — the confidence tells you nothing. The
// decisive forecaster's dots spread out AND sort by colour — low confidence
// mostly didn't happen, high confidence mostly did. That sorting is boldness.

type Mode = "hedger" | "decisive";

interface Pred {
  c: number; // confidence 0–100
  yes: boolean; // did it happen
}

const DATA: Record<Mode, { label: string; blurb: string; preds: Pred[] }> = {
  hedger: {
    label: "The hedger",
    blurb:
      "Every call hugs 50%. The greens and reds are jumbled together in the middle — the confidence level tells you nothing about which way things went. Never badly wrong, never saying anything.",
    preds: [
      { c: 46, yes: true },
      { c: 52, yes: false },
      { c: 49, yes: false },
      { c: 54, yes: true },
      { c: 48, yes: true },
      { c: 51, yes: false },
      { c: 47, yes: false },
      { c: 53, yes: true },
      { c: 50, yes: false },
      { c: 49, yes: true },
    ],
  },
  decisive: {
    label: "Decisive and honest",
    blurb:
      "The calls spread out — and they sort the outcomes. The low-confidence ones mostly didn't happen; the high-confidence ones mostly did. The numbers actually carry information.",
    preds: [
      { c: 12, yes: false },
      { c: 18, yes: false },
      { c: 26, yes: false },
      { c: 33, yes: true },
      { c: 41, yes: false },
      { c: 62, yes: true },
      { c: 71, yes: false },
      { c: 80, yes: true },
      { c: 88, yes: true },
      { c: 92, yes: true },
    ],
  },
};

const W = 420;
const H = 150;
const PAD_X = 30;
const AXIS_Y = 112;
const cx0 = (c: number) => PAD_X + (c / 100) * (W - 2 * PAD_X);
// A little vertical spread so overlapping dots stay legible; deterministic.
const rowY = (i: number) => AXIS_Y - 30 - ((i * 37) % 66);

export function BoldnessDemo() {
  const [mode, setMode] = useState<Mode>("hedger");
  const active = DATA[mode];

  return (
    <div>
      <div role="tablist" aria-label="Boldness examples" className="flex flex-wrap gap-2">
        {(Object.keys(DATA) as Mode[]).map((key) => {
          const selected = key === mode;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMode(key)}
              className={cx(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                selected
                  ? "border-accent bg-accent-tint text-accent"
                  : "border-border text-ink-secondary hover:bg-surface",
              )}
            >
              {DATA[key].label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 items-center gap-6 md:grid-cols-[420px_1fr]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-[420px] justify-self-center"
          role="img"
          aria-label={`${active.label}: ${active.blurb}`}
        >
          {/* Confidence axis */}
          <line x1={cx0(0)} y1={AXIS_Y} x2={cx0(100)} y2={AXIS_Y} className="stroke-border" strokeWidth={1} />
          {/* 50% marker — the "hedge" line */}
          <line
            x1={cx0(50)}
            y1={20}
            x2={cx0(50)}
            y2={AXIS_Y}
            className="stroke-border-subtle"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {[0, 50, 100].map((t) => (
            <text
              key={t}
              x={cx0(t)}
              y={AXIS_Y + 16}
              textAnchor="middle"
              className="fill-[var(--color-ink-tertiary)] text-[10px]"
            >
              {t}%
            </text>
          ))}
          <text
            x={cx0(50)}
            y={H - 2}
            textAnchor="middle"
            className="fill-[var(--color-ink-secondary)] text-[11px]"
          >
            Confidence you gave each call
          </text>

          {active.preds.map((p, i) => (
            <circle
              key={i}
              cx={cx0(p.c)}
              cy={rowY(i)}
              r={6}
              className={p.yes ? "fill-success" : "fill-danger"}
              opacity={0.85}
            />
          ))}
        </svg>

        <div>
          <div className="flex flex-wrap gap-4 text-xs text-ink-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-success" /> It happened
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-danger" /> It didn&apos;t
            </span>
          </div>
          <p className="mt-3 text-sm text-ink-secondary">{active.blurb}</p>
        </div>
      </div>
    </div>
  );
}
