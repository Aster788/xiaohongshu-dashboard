"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardYearFilter } from "@/components/dashboard/DashboardYearFilter";
import type { TopNoteRowDTO, TopNotesSortKey } from "@/lib/dashboard/types";

function formatMetricValue(value: number | string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
}

function formatSignedMetricValue(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("en-US")}`;
}

function formatMetricSum(...values: Array<number | null>): string {
  const nums = values.filter((value): value is number => value != null);
  if (nums.length === 0) return "—";
  return nums.reduce((sum, value) => sum + value, 0).toLocaleString("en-US");
}

function formatPublishedDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function likesAndSaves(row: TopNoteRowDTO): number {
  return (row.likes ?? 0) + (row.saves ?? 0);
}

function compareRows(a: TopNoteRowDTO, b: TopNoteRowDTO, sortKey: TopNotesSortKey) {
  const primary = (() => {
    switch (sortKey) {
      case "impressions":
        return Number(b.impressions ?? -1) - Number(a.impressions ?? -1);
      case "likes-saves":
        return likesAndSaves(b) - likesAndSaves(a);
      case "shares":
        return (b.shares ?? -1) - (a.shares ?? -1);
      case "new-followers":
        return (b.followerGain ?? -1) - (a.followerGain ?? -1);
      case "views":
      default:
        return (b.views ?? -1) - (a.views ?? -1);
    }
  })();
  if (primary !== 0) return primary;

  const fallbackDate = b.publishedDateIso.localeCompare(a.publishedDateIso);
  if (fallbackDate !== 0) return fallbackDate;

  const fallbackViews = (b.views ?? -1) - (a.views ?? -1);
  if (fallbackViews !== 0) return fallbackViews;

  const fallbackImpressions = Number(b.impressions ?? -1) - Number(a.impressions ?? -1);
  if (fallbackImpressions !== 0) return fallbackImpressions;

  const fallbackLikesSaves = likesAndSaves(b) - likesAndSaves(a);
  if (fallbackLikesSaves !== 0) return fallbackLikesSaves;

  return (b.followerGain ?? -1) - (a.followerGain ?? -1);
}

function TopPostCard({ row, rank }: { row: TopNoteRowDTO; rank: number }) {
  return (
    <article className="top-post-card">
      <div className="top-post-rank">{rank}</div>
      <div className="top-post-body">
        <div className="top-post-meta-row">
          <p className="top-post-meta">
            <span className="top-post-format-badge">{row.format ?? "Post"}</span>
            <time dateTime={row.publishedDateIso} className="top-post-meta-date">
              {formatPublishedDate(row.publishedDateIso)}
            </time>
          </p>
          <div className="top-post-secondary">
            <span>Impressions {formatMetricValue(row.impressions)}</span>
            <span>Shares {formatMetricValue(row.shares)}</span>
          </div>
        </div>
        <div className="top-post-title-row">
          <h3>{row.title}</h3>
          {row.postUrl ? (
            <a className="top-post-link" href={row.postUrl} target="_blank" rel="noopener noreferrer">
              View post
              <span className="top-post-link-arrow" aria-hidden="true">
                →
              </span>
            </a>
          ) : null}
        </div>
        <div className="top-post-metrics" aria-label="Post metrics">
          <span className="top-post-metric-item top-post-metric-views">
            <span className="top-post-metric-copy">
              <span className="top-post-metric-value">{formatMetricValue(row.views)}</span>
              <span className="top-post-metric-label">views</span>
            </span>
          </span>
          <span className="top-post-metric-item top-post-metric-likes">
            <span className="top-post-metric-copy">
              <span className="top-post-metric-value">{formatMetricSum(row.likes, row.saves)}</span>
              <span className="top-post-metric-label">likes & saves</span>
            </span>
          </span>
          <span className="top-post-metric-item top-post-metric-followers">
            <span className="top-post-metric-copy">
              <span className="top-post-metric-value">{formatSignedMetricValue(row.followerGain)}</span>
              <span className="top-post-metric-label">followers</span>
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

export function TopPostsPanel({
  years,
  initialYear,
  initialSort,
  notes,
}: {
  years: number[];
  initialYear: number | null;
  initialSort: TopNotesSortKey;
  notes: TopNoteRowDTO[];
}) {
  const [selectedYear, setSelectedYear] = useState<number | null>(initialYear);
  const [selectedSort, setSelectedSort] = useState<TopNotesSortKey>(initialSort);

  const rows = useMemo(() => {
    const filtered =
      selectedYear == null
        ? notes
        : notes.filter((row) => Number(row.publishedDateIso.slice(0, 4)) === selectedYear);
    return [...filtered].sort((a, b) => compareRows(a, b, selectedSort)).slice(0, 10);
  }, [notes, selectedSort, selectedYear]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selectedYear == null) {
      params.delete("year");
    } else {
      params.set("year", String(selectedYear));
    }
    if (selectedSort === "views") {
      params.delete("sort");
    } else {
      params.set("sort", selectedSort);
    }
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [selectedSort, selectedYear]);

  return (
    <>
      <DashboardYearFilter
        years={years}
        selectedYear={selectedYear}
        selectedSort={selectedSort}
        onYearChange={setSelectedYear}
        onSortChange={setSelectedSort}
      />
      {rows.length === 0 ? (
        <p className="empty-hint">No notes match this filter yet.</p>
      ) : (
        <div className="top-post-list" role="list" aria-label="Top 10 posts">
          {rows.map((row, idx) => (
            <div role="listitem" key={row.id}>
              <TopPostCard row={row} rank={idx + 1} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
