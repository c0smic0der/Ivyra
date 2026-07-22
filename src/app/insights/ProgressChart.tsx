"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RollingPoint } from "@/lib/scoring";

function ProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RollingPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p>Resolution #{point.n}</p>
      <p>Rolling Brier {point.value.toFixed(2)}</p>
    </div>
  );
}

export function ProgressChart({
  trend,
  baseline,
}: {
  trend: RollingPoint[];
  baseline: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis dataKey="n" type="number" className="text-xs fill-zinc-500" />
        <YAxis type="number" domain={[0, 1]} className="text-xs fill-zinc-500" />
        <Tooltip content={<ProgressTooltip />} />
        <ReferenceLine
          y={baseline}
          stroke="currentColor"
          className="text-zinc-400 dark:text-zinc-600"
          strokeDasharray="4 4"
          strokeWidth={2}
          label={{ value: `${baseline.toFixed(2)} baseline`, position: "insideTopRight", fontSize: 11 }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
