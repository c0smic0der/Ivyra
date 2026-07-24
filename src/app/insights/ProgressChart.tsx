"use client";

import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProgressPoint } from "@/lib/insights/insightsCore";
import { cx } from "@/components/ui/cx";
import { useInsightsSelection } from "./InsightsSelection";

type Mode = "recent" | "lifetime";

const AXIS_LABEL_STYLE = { fontSize: 11, fill: "var(--color-ink-tertiary)" } as const;

/** The plotted point: the chosen series value lives on one stable key (`shown`)
 * so switching mode changes the underlying data — line AND dots move together. */
interface PlottedPoint extends ProgressPoint {
  shown: number;
}

function ProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PlottedPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="max-w-56 rounded-xl border border-border bg-canvas px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium text-ink line-clamp-2">{point.text}</p>
      <p className="mt-0.5 text-ink-tertiary">This one scored {point.brier.toFixed(2)}</p>
      <p className="mt-0.5 text-ink-tertiary">
        Recent {point.value.toFixed(2)} · lifetime {point.lifetime.toFixed(2)}
      </p>
    </div>
  );
}

export function ProgressChart({ trend, baseline }: { trend: ProgressPoint[]; baseline: number }) {
  const { selection, setSelection } = useInsightsSelection();
  const [mode, setMode] = useState<Mode>("recent");
  const isRecent = mode === "recent";

  // Recent = the last N resolutions' recency-weighted form (a zoomed-in window);
  // Lifetime = the cumulative Brier across the whole history. Flipping changes
  // BOTH which resolutions are shown (the x range) and the series values.
  const RECENT_WINDOW = 20;
  const source = isRecent ? trend.slice(-RECENT_WINDOW) : trend;
  const plotted: PlottedPoint[] = source.map((p) => ({
    ...p,
    shown: isRecent ? p.value : p.lifetime,
  }));

  // Auto-scale the y-axis to the values on screen (with the 0.25 coin-flip
  // baseline kept in view as a reference), so the axis visibly rescales between
  // the two tabs instead of sitting on a fixed 0–1 range.
  const shownVals = plotted.map((p) => p.shown);
  const lo = Math.min(baseline, ...shownVals);
  const hi = Math.max(baseline, ...shownVals);
  const pad = Math.max(0.02, (hi - lo) * 0.15);
  const yDomain: [number, number] = [Math.max(0, lo - pad), Math.min(1, hi + pad)];

  // Drag-select state, in chart x-values (n). A mousedown+up with no move is a
  // single-point click; a drag spans a range. Either way we set the shared
  // selection, which filters the resolution history — no navigation.
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

  function readLabel(state: { activeLabel?: number | string | null } | null): number | null {
    if (state?.activeLabel == null) return null;
    const n = Number(state.activeLabel);
    return Number.isFinite(n) ? n : null;
  }

  function commitSelection() {
    if (dragStart === null) return;
    const lo = Math.min(dragStart, dragCurrent ?? dragStart);
    const hi = Math.max(dragStart, dragCurrent ?? dragStart);
    const chosen = trend.filter((p) => p.n >= lo && p.n <= hi);
    setDragStart(null);
    setDragCurrent(null);
    if (chosen.length === 0) return;
    const label =
      chosen.length === 1 ? `Resolution #${lo}` : `Resolutions #${lo}–#${hi} (${chosen.length})`;
    setSelection({ ids: chosen.map((p) => p.predictionId), label, nRange: [lo, hi] });
  }

  const dragging = dragStart !== null && dragCurrent !== null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["recent", "lifetime"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cx(
                "rounded-md px-3 py-1 font-medium capitalize transition-colors",
                mode === m ? "bg-accent text-white" : "text-ink-secondary hover:text-ink",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        {selection && (
          <button
            type="button"
            onClick={() => setSelection(null)}
            className="text-xs text-ink-tertiary hover:text-ink hover:underline"
          >
            Clear selection ✕
          </button>
        )}
      </div>

      <div className="cursor-crosshair select-none">
        {/* key={mode} remounts the chart on toggle so no cached dot geometry
            from the previous series can linger. */}
        <ResponsiveContainer key={mode} width="100%" height={400}>
          <ComposedChart
            data={plotted}
            margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
            onMouseDown={(s) => {
              const n = readLabel(s);
              if (n !== null) {
                setDragStart(n);
                setDragCurrent(n);
              }
            }}
            onMouseMove={(s) => {
              if (dragStart === null) return;
              const n = readLabel(s);
              if (n !== null) setDragCurrent(n);
            }}
            onMouseUp={commitSelection}
            onMouseLeave={commitSelection}
          >
            <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
            <XAxis
              dataKey="n"
              type="number"
              domain={["dataMin", "dataMax"]}
              height={56}
              tickMargin={10}
              className="text-xs fill-ink-tertiary"
              tickLine={false}
              label={{ value: "Resolution number", position: "insideBottom", offset: 6, style: AXIS_LABEL_STYLE }}
            />
            <YAxis
              type="number"
              domain={yDomain}
              width={76}
              tickMargin={8}
              tickFormatter={(v: number) => v.toFixed(2)}
              className="text-xs fill-ink-tertiary"
              tickLine={false}
              label={{
                value: "Brier score",
                angle: -90,
                position: "insideLeft",
                offset: 8,
                style: { ...AXIS_LABEL_STYLE, textAnchor: "middle" },
              }}
            />
            <Tooltip content={<ProgressTooltip />} />
            <ReferenceLine
              y={baseline}
              stroke="currentColor"
              className="text-ink-tertiary/40"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: `${baseline.toFixed(2)} baseline`, position: "insideTopRight", fontSize: 11, fill: "var(--color-ink-tertiary)" }}
            />
            {/* Committed selection (persisted between drags), padded so a single point still shows. */}
            {selection && !dragging && (
              <ReferenceArea
                x1={selection.nRange[0] - 0.4}
                x2={selection.nRange[1] + 0.4}
                fill="currentColor"
                className="text-accent"
                fillOpacity={0.12}
                stroke="none"
              />
            )}
            {/* Live drag rectangle. */}
            {dragging && (
              <ReferenceArea
                x1={Math.min(dragStart, dragCurrent)}
                x2={Math.max(dragStart, dragCurrent)}
                fill="currentColor"
                className="text-accent"
                fillOpacity={0.18}
                stroke="none"
              />
            )}
            <Line
              type="monotone"
              dataKey="shown"
              stroke="currentColor"
              className="text-accent"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, className: "fill-accent stroke-canvas" }}
              isAnimationActive={false}
            />
            {/* Dots as a separate Scatter — recharts recomputes these from the
                current data every render, so they move with the rolling/lifetime
                toggle instead of caching the previous series' positions. */}
            <Scatter dataKey="shown" fill="currentColor" className="text-accent" r={3} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-tertiary">
        Click a point — or drag across the chart — to show those resolutions in your history.
      </p>
    </div>
  );
}
