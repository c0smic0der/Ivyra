"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CalibrationPoint } from "@/lib/insights/insightsCore";

// The 45° perfect-calibration reference — static chart scaffolding, not
// computed data, so it's the one deliberate exception to "every number comes
// from the scoring module."
const DIAGONAL = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];

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
        Stated {Math.round(point.x * 100)}% · Actual {Math.round(point.y * 100)}%
      </p>
      <p className="mt-0.5 text-ink-tertiary">n={point.n}</p>
    </div>
  );
}

export function CalibrationChart({ points }: { points: CalibrationPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
        <XAxis
          dataKey="x"
          type="number"
          domain={[0, 1]}
          ticks={TICKS}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          className="text-xs fill-ink-tertiary"
          tickLine={false}
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={[0, 1]}
          ticks={TICKS}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          className="text-xs fill-ink-tertiary"
          tickLine={false}
        />
        <Tooltip content={<CalibrationTooltip />} />
        <Line
          data={DIAGONAL}
          dataKey="y"
          stroke="currentColor"
          className="text-ink-tertiary/40"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          data={points}
          dataKey="y"
          type="monotone"
          stroke="currentColor"
          className="text-accent"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Scatter
          data={points}
          dataKey="y"
          fill="currentColor"
          className="text-accent"
          r={5}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
