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
    <div className="rounded-xl border border-border bg-canvas px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium text-ink">Resolution #{point.n}</p>
      <p className="mt-0.5 text-ink-tertiary">Rolling Brier {point.value.toFixed(2)}</p>
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
        <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
        <XAxis dataKey="n" type="number" className="text-xs fill-ink-tertiary" tickLine={false} />
        <YAxis type="number" domain={[0, 1]} className="text-xs fill-ink-tertiary" tickLine={false} />
        <Tooltip content={<ProgressTooltip />} />
        <ReferenceLine
          y={baseline}
          stroke="currentColor"
          className="text-ink-tertiary/40"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `${baseline.toFixed(2)} baseline`,
            position: "insideTopRight",
            fontSize: 11,
            fill: "var(--color-ink-tertiary)",
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="currentColor"
          className="text-accent"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
