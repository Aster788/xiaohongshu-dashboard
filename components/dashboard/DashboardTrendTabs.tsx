"use client";

import { useState, type ReactNode } from "react";
import type { TrendPointDTO } from "@/lib/dashboard/types";
import { PublishedPostsBarChart } from "./PublishedPostsBarChart";
import { TrendLineChart } from "./TrendLineChart";

/** Division sign U+00F7 (÷); legacy emoji U+2797 — split note body to style divisor separately */
const CTR_NOTE_DIVISOR = /\u00F7|\u2797\uFE0F?/g;

export type TrendTab = {
  key: string;
  label: string;
  valueLabel: string;
  chartAriaLabel: string;
  data: TrendPointDTO[];
  chartType?: "line" | "monthlyBar";
  note?: string;
};

export function DashboardTrendTabs({ tabs }: { tabs: TrendTab[] }) {
  const [activeKey, setActiveKey] = useState(tabs[0]?.key ?? "");
  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0] ?? null;
  const coverCtrNote = tabs.find((tab) => tab.key === "cover-ctr")?.note ?? null;

  if (!active) return null;

  const panelId = `trend-panel-${active.key}`;
  const panelNote = active.key === "cover-ctr" ? null : active.note;

  function renderNoteBody(body: string): ReactNode {
    const matches = [...body.matchAll(CTR_NOTE_DIVISOR)];
    if (matches.length === 0) return body;
    const parts = body.split(CTR_NOTE_DIVISOR);
    const out: ReactNode[] = [];
    parts.forEach((part, i) => {
      out.push(part);
      const m = matches[i];
      if (m) {
        out.push(
          <span key={`d-${i}-${m.index}`} className="trend-panel-note-divisor">
            {m[0]}
          </span>
        );
      }
    });
    return out;
  }

  function renderNote(note: string) {
    if (note.startsWith("Note:")) {
      const body = note.replace(/^Note:\s*/, "");
      return (
        <>
          <strong>Note:</strong> {renderNoteBody(body)}
        </>
      );
    }
    return renderNoteBody(note);
  }

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

        {panelNote ? <p className="section-footnote">{renderNote(panelNote)}</p> : null}

        {coverCtrNote && active.key === "cover-ctr" ? (
          <p className="section-footnote">{renderNote(coverCtrNote)}</p>
        ) : null}
      </div>
    </div>
  );
}
