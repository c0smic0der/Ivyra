"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

// A sample calibration curve the reader can flip between the three shapes, so
// "dots below the line = overconfident" becomes something they SEE, not a
// sentence they have to trust. Illustrative data, not the user's — the real
// curve is earned with ~30 resolutions (see the page copy).

type Shape = "overconfident" | "calibrated" | "underconfident" | "hedging";

// Bucket centers along the confidence axis, and the hit rate each shape produces.
const CONFIDENCE = [0.1, 0.3, 0.5, 0.7, 0.9];

interface Point {
  c: number;
  hit: number;
}

const SHAPES: Record<Shape, { label: string; blurb: string; points: Point[] }> = {
  overconfident: {
    label: "Overconfident",
    blurb:
      "Every dot sits below the line: things happen less often than you claimed. When you say 90%, it comes true far less than 90% of the time. This is the common human pattern.",
    points: CONFIDENCE.map((c) => ({ c, hit: Math.max(0.04, c - 0.18) })),
  },
  calibrated: {
    label: "Well-calibrated",
    blurb:
      "The dots land on the line: your 70%s happen about 70% of the time, your 90%s about 90%. Your stated confidence can be taken at face value.",
    points: CONFIDENCE.map((c) => ({ c, hit: c })),
  },
  underconfident: {
    label: "Underconfident",
    blurb:
      "Every dot sits above the line: things happen more often than you admitted. Your cautious 60%s were really closer to 80%. You knew more than you let on.",
    points: CONFIDENCE.map((c) => ({ c, hit: Math.min(0.97, c + 0.18) })),
  },
  hedging: {
    label: "Hedging",
    blurb:
      "Answer “50%” to everything and there's only ever one dot, sitting right on the line. Technically calibrated — and completely uninformative. A good score alone can't catch this, which is exactly what boldness (below) is for.",
    points: [{ c: 0.5, hit: 0.5 }],
  },
};

// SVG geometry. Data lives in 0–1; these map it into a padded square.
const SIZE = 320;
const PAD_LEFT = 44;
const PAD_BOTTOM = 40;
const PAD_TOP = 18;
const PAD_RIGHT = 18;
const x = (v: number) => PAD_LEFT + v * (SIZE - PAD_LEFT - PAD_RIGHT);
const y = (v: number) => SIZE - PAD_BOTTOM - v * (SIZE - PAD_TOP - PAD_BOTTOM);

const TICKS = [0, 0.25, 0.5, 0.75, 1];

export function CurveDemo() {
  const [shape, setShape] = useState<Shape>("overconfident");
  const active = SHAPES[shape];
  const points = active.points;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Calibration shapes"
        className="flex flex-wrap gap-2"
      >
        {(Object.keys(SHAPES) as Shape[]).map((key) => {
          const selected = key === shape;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setShape(key)}
              className={cx(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                selected
                  ? "border-accent bg-accent-tint text-accent"
                  : "border-border text-ink-secondary hover:bg-surface",
              )}
            >
              {SHAPES[key].label}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 items-center gap-6 md:grid-cols-[320px_1fr]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-full max-w-[320px] justify-self-center"
          role="img"
          aria-label={`A ${active.label.toLowerCase()} calibration curve: ${active.blurb}`}
        >
          {/* Gridlines + tick labels */}
          {TICKS.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                y1={y(0)}
                x2={x(t)}
                y2={y(1)}
                className="stroke-border-subtle"
                strokeWidth={1}
              />
              <line
                x1={x(0)}
                y1={y(t)}
                x2={x(1)}
                y2={y(t)}
                className="stroke-border-subtle"
                strokeWidth={1}
              />
              <text
                x={x(t)}
                y={SIZE - PAD_BOTTOM + 16}
                textAnchor="middle"
                className="fill-[var(--color-ink-tertiary)] text-[10px]"
              >
                {Math.round(t * 100)}%
              </text>
              <text
                x={PAD_LEFT - 8}
                y={y(t) + 3}
                textAnchor="end"
                className="fill-[var(--color-ink-tertiary)] text-[10px]"
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}

          {/* Perfect-calibration diagonal */}
          <line
            x1={x(0)}
            y1={y(0)}
            x2={x(1)}
            y2={y(1)}
            className="stroke-ink-tertiary"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />

          {/* The user's line + dots. A single-dot shape (hedging) draws no line. */}
          {points.length > 1 && (
            <polyline
              points={points.map((p) => `${x(p.c)},${y(p.hit)}`).join(" ")}
              fill="none"
              className="stroke-accent"
              strokeWidth={2}
            />
          )}
          {points.map((p) => (
            <circle
              key={p.c}
              cx={x(p.c)}
              cy={y(p.hit)}
              r={5}
              className="fill-accent"
            />
          ))}

          {/* Axis titles */}
          <text
            x={x(0.5)}
            y={SIZE - 6}
            textAnchor="middle"
            className="fill-[var(--color-ink-secondary)] text-[11px]"
          >
            Your confidence
          </text>
          <text
            x={14}
            y={y(0.5)}
            textAnchor="middle"
            transform={`rotate(-90 14 ${y(0.5)})`}
            className="fill-[var(--color-ink-secondary)] text-[11px]"
          >
            How often it happened
          </text>
        </svg>

        <div>
          <p className="text-sm text-ink-secondary">{active.blurb}</p>
          <p className="mt-4 text-xs text-ink-tertiary">
            The dashed line is perfect calibration. The gap between each dot and that line is,
            literally, the size of your self-deception at that confidence level.
          </p>
        </div>
      </div>
    </div>
  );
}
