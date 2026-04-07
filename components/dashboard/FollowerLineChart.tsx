"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { FollowerPointDTO } from "@/lib/dashboard/types";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MILESTONE_STEP = 250;

type Row = FollowerPointDTO & {
  burstDot: boolean;
  milestoneDot: boolean;
  milestoneLevel: number | null;
  /** Ingested daily net only; undefined means no explicit source data for this day. */
  netForTooltip: number | undefined;
};

function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

/** First `dateIso` in each calendar month (for monthly X ticks). */
function monthTickDateIsos(data: FollowerPointDTO[]): string[] {
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

function enrichFollowerSeries(raw: FollowerPointDTO[]): Row[] {
  return raw.map((row, i) => {
    const prev = i > 0 ? raw[i - 1]!.followers : null;
    const prevBucket =
      prev === null ? -1 : Math.floor(prev / MILESTONE_STEP);
    const bucket = Math.floor(row.followers / MILESTONE_STEP);
    const milestoneDot =
      row.followers > 0 && prev !== null && bucket > prevBucket;
    const milestoneLevel = milestoneDot ? bucket * MILESTONE_STEP : null;
    const netForTooltip = row.netDelta;
    return {
      ...row,
      burstDot: !!row.burst,
      milestoneDot,
      milestoneLevel,
      netForTooltip,
    };
  });
}

function formatMonthYearUtc(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatNetDelta(n: number | undefined): string {
  if (n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("en-US")}`;
}

function FollowerTooltip(props: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: Row }>;
}) {
  const { active, payload } = props;
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;

  const dt = parseIsoUtc(p.dateIso);
  const weekday = dt.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const calendar = dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{`${weekday}, ${calendar}`}</div>
      <div style={{ marginTop: "0.35rem" }}>
        Total followers: {p.followers.toLocaleString("en-US")}
      </div>
      <div>Net change: {formatNetDelta(p.netForTooltip)}</div>
      {p.milestoneDot && p.milestoneLevel != null ? (
        <div className="chart-tooltip-milestone">
          Milestone: {p.milestoneLevel.toLocaleString("en-US")} followers
        </div>
      ) : null}
      {p.burstDot ? (
        <div className="chart-tooltip-burst">Burst day (net gain ≥ 15)</div>
      ) : null}
    </div>
  );
}

const axisTick = { fill: "var(--caser-chart-axis)", fontSize: 11 };

export function FollowerLineChart({
  data,
  ariaLabel,
}: {
  data: FollowerPointDTO[];
  ariaLabel: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `followerFill-${uid}`;
  const shadowId = `followerLineShadow-${uid}`;
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const chartData = useMemo(() => enrichFollowerSeries(data), [data]);
  const monthTicks = useMemo(() => monthTickDateIsos(data), [data]);
  const monthGuides = monthTicks.slice(1);

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  if (chartData.length === 0) {
    return <p className="empty-hint">No follower trend data yet.</p>;
  }

  return (
    <div className="chart-figure" role="img" aria-label={ariaLabel}>
      <div
        className="chart-box chart-box-lg"
        style={{ width: "100%", minWidth: 0 }}
        aria-hidden="true"
      >
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart
              data={chartData}
              margin={
                isMobile
                  ? { top: 8, right: 16, left: 0, bottom: 16 }
                  : { top: 12, right: 34, left: 4, bottom: 24 }
              }
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--caser-chart-primary)"
                    stopOpacity={0.24}
                  />
                  <stop
                    offset="78%"
                    stopColor="var(--caser-chart-primary)"
                    stopOpacity={0.06}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--caser-chart-primary)"
                    stopOpacity={0.01}
                  />
                </linearGradient>
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
                    stdDeviation="2.2"
                    floodColor="#5b21b6"
                    floodOpacity="0.18"
                  />
                </filter>
              </defs>
              <CartesianGrid
                stroke="var(--caser-chart-grid)"
                strokeDasharray="3 6"
                vertical={false}
              />
              {monthGuides.map((iso) => (
                <ReferenceLine
                  key={iso}
                  x={iso}
                  stroke="rgba(148, 163, 184, 0.36)"
                  strokeDasharray="4 5"
                />
              ))}
              <XAxis
                dataKey="dateIso"
                type="category"
                ticks={monthTicks}
                tickFormatter={formatMonthYearUtc}
                tick={axisTick}
                tickMargin={12}
                padding={{ left: 4, right: 18 }}
                axisLine={{ stroke: "rgba(148, 163, 184, 0.5)" }}
                tickLine={{ stroke: "rgba(148, 163, 184, 0.5)" }}
              />
              <YAxis
                tick={axisTick}
                tickFormatter={(v) => Number(v).toLocaleString("en-US")}
                width={isMobile ? 48 : 58}
                domain={[0, "auto"]}
                padding={{ top: 10, bottom: 6 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                content={(p) => (
                  <FollowerTooltip
                    active={p.active}
                    payload={
                      p.payload as ReadonlyArray<{ payload?: Row }> | undefined
                    }
                  />
                )}
              />
              <Area
                type="linear"
                dataKey="followers"
                stroke="none"
                fill={`url(#${gradId})`}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="followers"
                stroke="var(--caser-chart-primary)"
                strokeWidth={2.75}
                dot={(props) => {
                  const row = props.payload as Row | undefined;
                  if (!row) return null;
                  if (row.burstDot) {
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={7.25}
                        fill="var(--caser-chart-secondary)"
                        stroke="#fff"
                        strokeWidth={2.25}
                        style={{ filter: `url(#${shadowId})` }}
                      />
                    );
                  }
                  if (row.milestoneDot) {
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={5.5}
                        fill="var(--caser-chart-primary)"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }
                  return null;
                }}
                activeDot={{
                  r: 7.5,
                  fill: "var(--caser-chart-secondary)",
                  stroke: "#fff",
                  strokeWidth: 2.25,
                }}
                style={{ filter: `url(#${shadowId})` }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}
