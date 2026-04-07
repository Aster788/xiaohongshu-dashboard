"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { TrendPointDTO } from "@/lib/dashboard/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MonthlyRow = {
  monthIso: string;
  total: number;
};

function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

function formatMonthYearUtc(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function aggregateMonthly(data: TrendPointDTO[]): MonthlyRow[] {
  const byMonth = new Map<string, number>();
  for (const row of data) {
    const monthIso = `${row.dateIso.slice(0, 7)}-01`;
    byMonth.set(monthIso, (byMonth.get(monthIso) ?? 0) + row.value);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthIso, total]) => ({
      monthIso,
      total,
    }));
}

function PublishedTooltip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown; payload?: MonthlyRow }>;
}) {
  const first = props.payload?.[0];
  if (!props.active || !first?.payload) return null;

  const raw = first.value;
  const total =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">
        {formatMonthYearUtc(first.payload.monthIso)}
      </div>
      <div>
        Published posts: {Number.isFinite(total) ? total.toLocaleString("en-US") : "—"}
      </div>
    </div>
  );
}

const axisTickSm = { fill: "var(--caser-chart-axis)", fontSize: 10 };

export function PublishedPostsBarChart({
  data,
  chartAriaLabel,
}: {
  data: TrendPointDTO[];
  chartAriaLabel: string;
}) {
  const uid = useId().replace(/:/g, "");
  const shadowId = `publishedBarShadow-${uid}`;
  const [mounted, setMounted] = useState(false);
  const rows = useMemo(() => aggregateMonthly(data), [data]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (rows.length === 0) {
    return <p className="empty-hint subtle">No rows for this metric yet.</p>;
  }

  return (
    <div className="chart-figure" role="img" aria-label={chartAriaLabel}>
      <div
        className="chart-box chart-box-sm"
        style={{ width: "100%", minWidth: 0 }}
        aria-hidden="true"
      >
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={rows} margin={{ top: 8, right: 20, left: 2, bottom: 12 }}>
              <defs>
                <filter
                  id={shadowId}
                  x="-25%"
                  y="-25%"
                  width="150%"
                  height="150%"
                >
                  <feDropShadow
                    dx="0"
                    dy="1"
                    stdDeviation="1.6"
                    floodColor="#4338ca"
                    floodOpacity="0.14"
                  />
                </filter>
              </defs>
              <CartesianGrid
                stroke="var(--caser-chart-grid-subtle)"
                strokeDasharray="3 6"
                vertical={false}
              />
              <XAxis
                dataKey="monthIso"
                tickFormatter={formatMonthYearUtc}
                tick={axisTickSm}
                tickMargin={10}
                axisLine={{ stroke: "rgba(148, 163, 184, 0.48)" }}
                tickLine={{ stroke: "rgba(148, 163, 184, 0.48)" }}
              />
              <YAxis
                tick={axisTickSm}
                tickFormatter={(v) => Number(v).toLocaleString("en-US")}
                width={46}
                domain={[0, "auto"]}
                allowDecimals={false}
                padding={{ top: 8, bottom: 5 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(139, 92, 246, 0.14)" }}
                content={(p) => (
                  <PublishedTooltip
                    active={p.active}
                    payload={
                      p.payload as
                        | ReadonlyArray<{ value?: unknown; payload?: MonthlyRow }>
                        | undefined
                    }
                  />
                )}
              />
              <Bar
                dataKey="total"
                fill="var(--caser-chart-secondary)"
                radius={[10, 10, 0, 0]}
                maxBarSize={88}
                style={{ filter: `url(#${shadowId})` }}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
