"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CostDayPoint } from "@/lib/admin/costsCore";

function CostTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CostDayPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="rounded-xl border border-border bg-canvas px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium text-ink">{point.day}</p>
      <p className="mt-0.5 text-ink-tertiary">${point.costUsd.toFixed(4)}</p>
      <p className="text-ink-tertiary">
        {point.calls} call{point.calls === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/** Daily AI spend over time. Mirrors the insights ProgressChart styling. */
export function CostChart({ byDay }: { byDay: CostDayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={byDay} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
        <XAxis dataKey="day" className="text-xs fill-ink-tertiary" tickLine={false} />
        <YAxis
          className="text-xs fill-ink-tertiary"
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => `$${v.toFixed(4)}`}
        />
        <Tooltip content={<CostTooltip />} />
        <Area
          type="monotone"
          dataKey="costUsd"
          stroke="currentColor"
          className="text-accent"
          fill="currentColor"
          fillOpacity={0.12}
          strokeWidth={2}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
