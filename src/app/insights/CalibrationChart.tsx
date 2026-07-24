"use client";

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
import { calibrationBandFilter } from "@/lib/insights/historyView";
import type { CalibrationPoint } from "@/lib/insights/insightsCore";
import { useOptionalInsightsSelection } from "./InsightsSelection";

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
      <p className="mt-0.5 text-ink-tertiary">n={point.n} · click to filter the history</p>
    </div>
  );
}

export function CalibrationChart({ points }: { points: CalibrationPoint[] }) {
  // Present only inside /insights (interactive). On the landing-page demo there's
  // no provider, so this is null and the curve renders static.
  const sel = useOptionalInsightsSelection();
  // Real buckets always carry ≥1 member; a points set with none (the landing
  // demo) renders as a static curve — no click affordance, no hint.
  const interactive = sel !== null && points.some((p) => p.predictions.length > 0);

  // A click anywhere in the plot resolves to the nearest bucket and filters the
  // resolution history to that confidence band (then scrolls to it) — reliable,
  // unlike hitting a 5px dot exactly. recharts snaps `activeLabel` to the nearest
  // point's x; `activeIndex` is a fallback.
  function openBand(state: { activeLabel?: number | string | null; activeIndex?: number | string | null }) {
    if (!interactive || !sel) return;
    let point: CalibrationPoint | undefined;
    if (state?.activeLabel != null) {
      const x = Number(state.activeLabel);
      point = points.find((p) => p.x === x);
    }
    if (!point && state?.activeIndex != null) {
      const idx = Number(state.activeIndex);
      if (Number.isInteger(idx)) point = points[idx];
    }
    if (point?.predictions.length) sel.selectAndScroll(calibrationBandFilter(point));
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
        <p className="mt-2 text-xs text-ink-tertiary">
          Click a dot to filter your history to that confidence band.
        </p>
      )}
    </div>
  );
}
