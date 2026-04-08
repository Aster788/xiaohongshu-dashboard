"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isChartReady, setIsChartReady] = useState(false);

  useEffect(() => {
    const readyTimer = window.setTimeout(() => {
      setIsChartReady(true);
    }, 0);
    const mql = window.matchMedia("(max-width: 760px)");
    const sync = () => setIsMobileViewport(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => {
      window.clearTimeout(readyTimer);
      mql.removeEventListener("change", sync);
    };
  }, []);

  const active = tabs.find((tab) => tab.key === activeKey) ?? tabs[0] ?? null;
  const coverCtrNote = tabs.find((tab) => tab.key === "cover-ctr")?.note ?? null;

  if (!active) return null;

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
        className="trend-panels"
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active.key;
          const panelNote = tab.key === "cover-ctr" ? null : tab.note;
          return (
            <div
              key={tab.key}
              id={`trend-panel-${tab.key}`}
              className="trend-panel"
              role="tabpanel"
              aria-labelledby={`trend-tab-${tab.key}`}
              hidden={!isActive}
            >
              {tab.chartType === "monthlyBar" ? (
                <PublishedPostsBarChart
                  data={tab.data}
                  chartAriaLabel={tab.chartAriaLabel}
                  isMobileViewport={isMobileViewport}
                  isReady={isChartReady}
                />
              ) : (
                <TrendLineChart
                  data={tab.data}
                  valueLabel={tab.valueLabel}
                  chartAriaLabel={tab.chartAriaLabel}
                  isMobileViewport={isMobileViewport}
                  isReady={isChartReady}
                />
              )}

              {panelNote ? <p className="section-footnote">{renderNote(panelNote)}</p> : null}

              {coverCtrNote && tab.key === "cover-ctr" ? (
                <p className="section-footnote">{renderNote(coverCtrNote)}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
