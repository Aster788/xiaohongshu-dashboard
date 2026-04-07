"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { TrendPointDTO } from "@/lib/dashboard/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Row = TrendPointDTO;

function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

function monthTickDateIsos(data: TrendPointDTO[]): string[] {
  const out: string[] = [];
  let prevYm = "";
  for (const row of data) {
    const ym = row.dateIso.slice(0, 7);
    if (ym !== prevYm) {
      prevYm = ym;
      out.push(row.dateIso);
    }
  }
  return out;
}

function formatMonthYearUtc(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatFullDateUtc(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function TrendTooltip(
  props: {
    active?: boolean;
    payload?: ReadonlyArray<{ value?: unknown; payload?: TrendPointDTO }>;
    label?: string | number;
    valueLabel: string;
  },
) {
  const { active, payload, label, valueLabel } = props;
  const first = payload?.[0];
  if (!active || !first) return null;
  const raw = first.value;
  const v =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : NaN;
  const dateIso = first.payload?.dateIso ?? String(label ?? "");
  return (
    <div className="chart-tooltip">
      {dateIso ? (
        <div className="chart-tooltip-date">{formatFullDateUtc(dateIso)}</div>
      ) : null}
      <div>
        {valueLabel}:{" "}
        {Number.isFinite(v) ? v.toLocaleString("en-US") : "—"}
      </div>
    </div>
  );
}

const axisTickSm = { fill: "var(--caser-chart-axis)", fontSize: 10 };

export function TrendLineChart({
  data,
  valueLabel,
  chartAriaLabel,
}: {
  data: TrendPointDTO[];
  valueLabel: string;
  chartAriaLabel: string;
}) {
  const uid = useId().replace(/:/g, "");
  const shadowId = `trendLineShadow-${uid}`;
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const rows: Row[] = data;
  const monthTicks = useMemo(() => monthTickDateIsos(data), [data]);

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
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
            <LineChart
              data={rows}
              margin={
                isMobile
                  ? { top: 6, right: 12, left: 0, bottom: 10 }
                  : { top: 8, right: 20, left: 2, bottom: 12 }
              }
            >
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
                    floodColor="#5b21b6"
                    floodOpacity="0.18"
                  />
                </filter>
              </defs>
              <CartesianGrid
                stroke="var(--caser-chart-grid-subtle)"
                strokeDasharray="3 6"
                vertical={false}
              />
              <XAxis
                dataKey="dateIso"
                type="category"
                ticks={monthTicks}
                tickFormatter={formatMonthYearUtc}
                tick={axisTickSm}
                tickMargin={10}
                padding={{ right: 8 }}
                axisLine={{ stroke: "rgba(148, 163, 184, 0.48)" }}
                tickLine={{ stroke: "rgba(148, 163, 184, 0.48)" }}
              />
              <YAxis
                tick={axisTickSm}
                tickFormatter={(v) => Number(v).toLocaleString("en-US")}
                width={isMobile ? 38 : 46}
                domain={[0, "auto"]}
                padding={{ top: 8, bottom: 5 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={(p) => (
                  <TrendTooltip
                    active={p.active}
                    payload={
                      p.payload as
                        | ReadonlyArray<{ value?: unknown; payload?: TrendPointDTO }>
                        | undefined
                    }
                    label={p.label}
                    valueLabel={valueLabel}
                  />
                )}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--caser-chart-secondary)"
                strokeWidth={2.35}
                dot={false}
                activeDot={{
                  r: 5,
                  fill: "var(--caser-chart-primary)",
                  stroke: "#fff",
                  strokeWidth: 2,
                }}
                style={{ filter: `url(#${shadowId})` }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
