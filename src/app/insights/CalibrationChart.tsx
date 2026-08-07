"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  LabelList,
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

const AXIS_LABEL_STYLE = { fontSize: 12, fill: "var(--color-ink-tertiary)" } as const;

/** A point plus the two derived series that shade the gap to the diagonal. The
 *  band is drawn as a transparent lower envelope (`lower`) with the accent-filled
 *  `band` stacked on top, so the fill sits exactly between the user's curve and
 *  the perfect-calibration line — the visual "size of your overconfidence". */
interface PlottedPoint extends CalibrationPoint {
  lower: number;
  band: number;
}

function pct(v: number): number {
  return Math.round(v * 100);
}

function CalibrationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PlottedPoint }>;
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

  // The shaded-gap series: `lower` is the envelope both lines share (min of the
  // two), `band` is the distance to the other — stacked, they fill the gap.
  const plotted: PlottedPoint[] = points.map((p) => ({
    ...p,
    lower: Math.min(p.y, p.x),
    band: Math.abs(p.y - p.x),
  }));

  // A click anywhere in the plot resolves to the nearest bucket and filters the
  // resolution history to that confidence band (then scrolls to it) — reliable,
  // unlike hitting a 5px dot exactly. recharts snaps `activeLabel` to the nearest
  // point's x; `activeIndex` is a fallback.
  function openBand(state: { activeLabel?: number | string | null; activeIndex?: number | string | null }) {
    if (!interactive || !sel) return;
    let point: PlottedPoint | undefined;
    if (state?.activeLabel != null) {
      const x = Number(state.activeLabel);
      point = plotted.find((p) => p.x === x);
    }
    if (!point && state?.activeIndex != null) {
      const idx = Number(state.activeIndex);
      if (Number.isInteger(idx)) point = plotted[idx];
    }
    if (point?.predictions.length) sel.selectAndScroll(calibrationBandFilter(point));
  }

  return (
    <div>
      <div className={interactive ? "cursor-pointer" : undefined}>
        <ResponsiveContainer width="100%" height={520}>
          <ComposedChart data={plotted} margin={{ top: 16, right: 20, bottom: 10, left: 10 }} onClick={openBand}>
            <CartesianGrid strokeDasharray="2 4" className="stroke-border-subtle" />
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

            {/* The shaded gap between the user's curve and the diagonal. Drawn
                first so the reference line, curve, and dots sit on top. The
                transparent `lower` envelope carries the accent-filled `band`. */}
            <Area
              dataKey="lower"
              stackId="gap"
              type="monotone"
              stroke="none"
              fill="none"
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
            />
            <Area
              dataKey="band"
              stackId="gap"
              type="monotone"
              stroke="none"
              fill="currentColor"
              className="text-accent"
              fillOpacity={0.12}
              isAnimationActive={false}
              activeDot={false}
              legendType="none"
            />

            {/* Perfect-calibration reference — static scaffolding, drawn as a
                segment so `plotted` stays the chart's only dataset (keeps click
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
            <Scatter dataKey="y" fill="currentColor" className="text-accent" isAnimationActive={false}>
              <LabelList
                dataKey="n"
                position="top"
                offset={10}
                formatter={(v) => `n=${v}`}
                style={{ fontSize: 10, fill: "var(--color-ink-tertiary)" }}
              />
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {interactive && (
        <p className="mt-2 text-xs text-ink-tertiary">
          Click a dot to filter your history to that confidence band. The shaded band is the gap to perfect
          calibration.
        </p>
      )}
    </div>
  );
}
