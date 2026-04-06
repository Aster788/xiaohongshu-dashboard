"use client";

import { useId } from "react";
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

type Row = TrendPointDTO & { label: string };

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
      {dateIso ? <div className="chart-tooltip-date">{dateIso}</div> : null}
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

  const rows: Row[] = data.map((d) => ({
    ...d,
    label: d.dateIso.slice(5),
  }));

  if (rows.length === 0) {
    return <p className="empty-hint subtle">No rows for this metric yet.</p>;
  }

  return (
    <div className="chart-figure" role="img" aria-label={chartAriaLabel}>
      <div
        className="chart-box chart-box-sm"
        style={{ width: "100%", minWidth: 0, height: 220 }}
        aria-hidden="true"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={rows}
            margin={{ top: 8, right: 10, left: 2, bottom: 2 }}
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
                  floodColor="#7b3ab8"
                  floodOpacity="0.28"
                />
              </filter>
            </defs>
            <CartesianGrid
              stroke="var(--caser-chart-grid-subtle)"
              strokeDasharray="3 6"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={axisTickSm}
              tickMargin={7}
              minTickGap={32}
              axisLine={{ stroke: "rgba(92, 24, 145, 0.12)" }}
              tickLine={{ stroke: "rgba(92, 24, 145, 0.12)" }}
            />
            <YAxis
              tick={axisTickSm}
              tickFormatter={(v) => Number(v).toLocaleString("en-US")}
              width={46}
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
      </div>
    </div>
  );
}
