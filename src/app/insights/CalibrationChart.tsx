"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalibrationPoint, HistoryItemLite } from "@/lib/insights/insightsCore";

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];

const AXIS_LABEL_STYLE = { fontSize: 11, fill: "var(--color-ink-tertiary)" } as const;

function pct(v: number): number {
  return Math.round(v * 100);
}

function CalibrationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CalibrationPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="rounded-xl border border-border bg-canvas px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium text-ink">
        Stated {pct(point.x)}% · Actual {pct(point.y)}%
      </p>
      <p className="mt-0.5 text-ink-tertiary">n={point.n} · click to see them</p>
    </div>
  );
}

/** YES/NO pill — the same success/danger vocabulary the resolve screen uses. */
function OutcomeBadge({ outcome }: { outcome: boolean }) {
  return (
    <span
      className={
        outcome
          ? "shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success"
          : "shrink-0 rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger"
      }
    >
      {outcome ? "Yes" : "No"}
    </span>
  );
}

/** Modal listing every prediction behind one calibration dot. */
function BandPanel({ point, onClose }: { point: CalibrationPoint; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl border border-border bg-canvas shadow-[var(--shadow-card)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Predictions in the ${pct(point.low)} to ${pct(point.high)} percent confidence band`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {pct(point.low)}–{pct(point.high)}% confidence band
            </p>
            <p className="mt-0.5 text-xs text-ink-tertiary">
              {point.n} prediction{point.n === 1 ? "" : "s"} · you said {pct(point.x)}% on average ·{" "}
              {pct(point.y)}% came true
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-ink-tertiary hover:bg-surface hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <ul className="flex-1 divide-y divide-border-subtle overflow-y-auto">
          {point.predictions.map((p: HistoryItemLite) => (
            <li key={p.id}>
              <Link
                href={`/predictions/${p.id}/resolve`}
                className="flex items-center justify-between gap-3 p-4 text-sm transition-colors hover:bg-surface"
              >
                <span className="min-w-0">
                  <span className="block truncate text-ink">{p.text}</span>
                  <span className="mt-0.5 block text-xs text-ink-tertiary">
                    Said {pct(p.confidence)}% · Brier {p.brier.toFixed(2)}
                  </span>
                </span>
                <OutcomeBadge outcome={p.outcome} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CalibrationChart({ points }: { points: CalibrationPoint[] }) {
  const [selected, setSelected] = useState<CalibrationPoint | null>(null);
  // Real buckets always carry ≥1 member; a points set with none (the landing
  // demo) renders as a static curve — no click affordance, no hint.
  const interactive = points.some((p) => p.predictions.length > 0);

  // A click anywhere in the plot resolves to the nearest bucket and opens that
  // band — reliable, unlike hitting a 5px dot exactly. recharts snaps
  // `activeLabel` to the nearest point's x; `activeIndex` is a fallback.
  function openBand(state: { activeLabel?: number | string | null; activeIndex?: number | string | null }) {
    if (!interactive) return;
    let point: CalibrationPoint | undefined;
    if (state?.activeLabel != null) {
      const x = Number(state.activeLabel);
      point = points.find((p) => p.x === x);
    }
    if (!point && state?.activeIndex != null) {
      const idx = Number(state.activeIndex);
      if (Number.isInteger(idx)) point = points[idx];
    }
    if (point?.predictions.length) setSelected(point);
  }

  return (
    <div>
      <div className={interactive ? "cursor-pointer" : undefined}>
        <ResponsiveContainer width="100%" height={440}>
          <ComposedChart data={points} margin={{ top: 10, right: 20, bottom: 10, left: 10 }} onClick={openBand}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, 1]}
              ticks={TICKS}
              tickFormatter={(v: number) => `${pct(v)}%`}
              height={56}
              tickMargin={10}
              className="text-xs fill-ink-tertiary"
              tickLine={false}
              label={{ value: "Stated confidence", position: "insideBottom", offset: 6, style: AXIS_LABEL_STYLE }}
            />
            <YAxis
              dataKey="y"
              type="number"
              domain={[0, 1]}
              ticks={TICKS}
              tickFormatter={(v: number) => `${pct(v)}%`}
              width={76}
              tickMargin={8}
              className="text-xs fill-ink-tertiary"
              tickLine={false}
              label={{
                value: "Actual frequency",
                angle: -90,
                position: "insideLeft",
                offset: 8,
                style: { ...AXIS_LABEL_STYLE, textAnchor: "middle" },
              }}
            />
            <Tooltip content={<CalibrationTooltip />} />
            {/* Perfect-calibration reference — static scaffolding, drawn as a
                segment so `points` stays the chart's only dataset (keeps click
                indexing unambiguous). */}
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 1, y: 1 },
              ]}
              stroke="currentColor"
              className="text-ink-tertiary/40"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
            <Line
              dataKey="y"
              type="monotone"
              stroke="currentColor"
              className="text-accent"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter dataKey="y" fill="currentColor" className="text-accent" r={5} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {interactive && (
        <p className="mt-2 text-xs text-ink-tertiary">Click a dot to see the predictions behind it.</p>
      )}
      {selected && <BandPanel point={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
