"use client";

import { useState } from "react";
import type { TrendPointDTO } from "@/lib/dashboard/types";
import { PublishedPostsBarChart } from "./PublishedPostsBarChart";
import { TrendLineChart } from "./TrendLineChart";

export type TrendTab = {
  key: string;
  label: string;
  valueLabel: string;
  chartAriaLabel: string;
  data: TrendPointDTO[];
  chartType?: "line" | "monthlyBar";
  note?: string;
};

function parseIsoUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
}

function formatShortDate(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRangeLabel(data: TrendPointDTO[]): string | null {
  if (data.length === 0) return null;
  const first = data[0]?.dateIso;
  const last = data[data.length - 1]?.dateIso;
  if (!first || !last) return null;
  return `${formatShortDate(first)} - ${formatShortDate(last)}`;
}

export function DashboardTrendTabs({ tabs }: { tabs: TrendTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? "");
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0] ?? null;

  if (!active) return null;

  const panelId = `trend-panel-${active.key}`;
  const rangeLabel = formatRangeLabel(active.data);

  return (
    <div className="trend-tabs">
      <div
        className="trend-tab-list"
        role="tablist"
        aria-label="Switch engagement and view trend metric"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active.key;
          const tabId = `trend-tab-${tab.key}`;
          return (
            <button
              key={tab.key}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`trend-panel-${tab.key}`}
              className={isActive ? "trend-tab active" : "trend-tab"}
              onClick={() => setActiveKey(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={panelId}
        className="trend-panel"
        role="tabpanel"
        aria-labelledby={`trend-tab-${active.key}`}
      >
        {rangeLabel ? <div className="trend-panel-range">{rangeLabel}</div> : null}

        {active.chartType === "monthlyBar" ? (
          <PublishedPostsBarChart
            data={active.data}
            chartAriaLabel={active.chartAriaLabel}
          />
        ) : (
          <TrendLineChart
            data={active.data}
            valueLabel={active.valueLabel}
            chartAriaLabel={active.chartAriaLabel}
          />
        )}

        {active.note ? <p className="trend-panel-note">{active.note}</p> : null}
      </div>
    </div>
  );
}
