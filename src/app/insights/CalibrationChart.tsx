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
    <div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p>Stated {Math.round(point.x * 100)}%</p>
      <p>Actual {Math.round(point.y * 100)}%</p>
      <p className="text-zinc-500">n={point.n}</p>
    </div>
  );
}

export function CalibrationChart({ points }: { points: CalibrationPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis
          dataKey="x"
          type="number"
          domain={[0, 1]}
          ticks={TICKS}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          className="text-xs fill-zinc-500"
        />
        <YAxis
          dataKey="y"
          type="number"
          domain={[0, 1]}
          ticks={TICKS}
          tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
          className="text-xs fill-zinc-500"
        />
        <Tooltip content={<CalibrationTooltip />} />
        <Line
          data={DIAGONAL}
          dataKey="y"
          stroke="currentColor"
          className="text-zinc-400 dark:text-zinc-600"
          strokeDasharray="4 4"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Scatter data={points} dataKey="y" fill="#3b82f6" r={5} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
