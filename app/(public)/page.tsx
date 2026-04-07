import { FollowerLineChart } from "@/components/dashboard/FollowerLineChart";
import {
  DashboardTrendTabs,
  type TrendTab,
} from "@/components/dashboard/DashboardTrendTabs";
import { PerformanceOverviewMetrics } from "@/components/dashboard/PerformanceOverviewMetrics";
import { DashboardYearFilter } from "@/components/dashboard/DashboardYearFilter";
import { getDashboardSnapshotCached } from "@/lib/dashboard/queries";
import type { TopNoteRowDTO, TopNotesSortKey } from "@/lib/dashboard/types";
import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Xiaohongshu Analytics Dashboard",
  description: "Public analytics dashboard for Caser Rednote (Xiaohongshu).",
};

function parseYearFilter(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null || v === "") return null;
  const s = String(v).trim().toLowerCase();
  if (s === "all") return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1970 || n > 2100) return null;
  return n;
}

function parseTopNotesSort(raw: string | string[] | undefined): TopNotesSortKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  switch (v) {
    case "impressions":
    case "likes-saves":
    case "shares":
    case "new-followers":
      return v;
    case "views":
    default:
      return "views";
  }
}

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

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

function MetricIcon({
  kind,
}: {
  kind: "views" | "likes" | "saves" | "followers";
}) {
  if (kind === "views") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M1.2 8c1.7-2.9 4-4.4 6.8-4.4S13.1 5.1 14.8 8c-1.7 2.9-4 4.4-6.8 4.4S2.9 10.9 1.2 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2.15" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (kind === "likes") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 13.3 2.9 8.5A3.2 3.2 0 0 1 7.4 4l.6.6.6-.6a3.2 3.2 0 1 1 4.5 4.5L8 13.3Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (kind === "saves") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 2.2h8a1 1 0 0 1 1 1v10.4L8 10.8l-5 2.8V3.2a1 1 0 0 1 1-1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="6" cy="5.3" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M2.6 12.8c.7-1.9 2.1-2.9 3.4-2.9s2.7 1 3.4 2.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TopPostMetric({
  kind,
  value,
  label,
}: {
  kind: "views" | "likes" | "saves" | "followers";
  value: string;
  label: string;
}) {
  return (
    <span className={`top-post-metric-item top-post-metric-${kind}`}>
      <span className="top-post-metric-icon" aria-hidden="true">
        <MetricIcon kind={kind} />
      </span>
      <span className="top-post-metric-copy">
        <span className="top-post-metric-value">{value}</span>
        <span className="top-post-metric-label">{label}</span>
      </span>
    </span>
  );
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

function SectionHeading({
  index,
  title,
  subtitle,
  headingId,
}: {
  index: string;
  title: string;
  subtitle?: string;
  headingId: string;
}) {
  return (
    <div className="section-heading">
      <span className="section-badge" aria-hidden="true">
        {index}
      </span>
      <div className="section-heading-copy">
        <h2 id={headingId}>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function TopPostCard({
  row,
  rank,
}: {
  row: TopNoteRowDTO;
  rank: number;
}) {
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
            <a
              className="top-post-link"
              href={row.postUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View post
              <span className="top-post-link-arrow" aria-hidden="true">
                →
              </span>
            </a>
          ) : null}
        </div>
        <div className="top-post-metrics" aria-label="Post metrics">
          <TopPostMetric
            kind="views"
            value={formatMetricValue(row.views)}
            label="views"
          />
          <TopPostMetric
            kind="likes"
            value={formatMetricSum(row.likes, row.saves)}
            label="likes & saves"
          />
          <TopPostMetric
            kind="followers"
            value={formatSignedMetricValue(row.followerGain)}
            label="followers"
          />
        </div>
      </div>
    </article>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; sort?: string | string[] }>;
}) {
  const sp = await searchParams;
  const yearFilter = parseYearFilter(sp.year);
  const sortKey = parseTopNotesSort(sp.sort);
  const snap = await getDashboardSnapshotCached(yearFilter, sortKey);
  const followerSubtitle =
    "Follower growth from account creation date to the latest update date.";
  const trendSubtitle = "Data since Feb 15, 2026";
  const trendTabs: TrendTab[] = [
    {
      key: "views",
      label: "Views",
      valueLabel: "Views",
      chartAriaLabel: "Views over the last 30 ingested days.",
      data: snap.viewsTrend,
    },
    {
      key: "likes-saves",
      label: "Likes & saves",
      valueLabel: "Likes & saves",
      chartAriaLabel:
        "Daily likes plus saves summed over the last 30 ingested days.",
      data: snap.likesAndSavesTrend,
    },
    {
      key: "cover-ctr",
      label: "Cover CTR",
      valueLabel: "CTR",
      chartAriaLabel: "Cover CTR over the last 30 ingested days.",
      data: snap.coverCtrTrend,
      note: "Note: CTR = Click-Through Rate(点击率)，CTR = Views ÷ Impression x 100%.",
    },
    {
      key: "published",
      label: "Published posts",
      valueLabel: "Published",
      chartAriaLabel: "Published posts over the last 30 ingested days.",
      data: snap.publishTrend,
      chartType: "monthlyBar",
    },
  ];

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="hero-brand-band">
          <Image
            className="hero-brand-logo"
            src="/caser-logo-01.png"
            alt="Caser"
            width={640}
            height={640}
            priority
            sizes="(max-width: 760px) calc(100vw - 2.6rem), 48rem"
          />
        </div>
        <div className="hero-wave-band">
          <a
            className="hero-profile-link"
            href="https://xhslink.com/m/7wTuTv3kElG"
            target="_blank"
            rel="noopener noreferrer"
          >
            Click here to visit CASER on Xiaohongshu →
          </a>
        </div>
        <div className="dashboard-title-block">
          <h1 id="dashboard-title">Xiaohongshu Analytics Dashboard</h1>
        </div>
      </section>

      <section className="section section-card" aria-labelledby="overview-heading">
        <SectionHeading
          index="01"
          title="Performance Overview"
          subtitle="Percentage changes show increase or decrease compared to the 30 days prior."
          headingId="overview-heading"
        />
        <div className="performance-overview-stack">
          <div
            className="kpi-grid kpi-grid--in-section"
            aria-label="Key performance indicators"
          >
            <div className="kpi-card">
              <div className="kpi-label">total followers</div>
              <div className="kpi-value">{formatInt(snap.kpi.followers)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">total posts</div>
              <div className="kpi-value">{formatInt(snap.kpi.totalPosts)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">likes &amp; saves</div>
              <div className="kpi-value">{formatInt(snap.kpi.likesAndSaves)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">days since launch</div>
              <div className="kpi-value">{formatInt(snap.kpi.daysSinceLaunch)}</div>
            </div>
          </div>
          <PerformanceOverviewMetrics metrics={snap.performanceOverview} />
        </div>
      </section>

      <section className="section section-card" aria-labelledby="follower-heading">
        <SectionHeading
          index="02"
          title="Growth Timeline"
          subtitle={followerSubtitle}
          headingId="follower-heading"
        />
        <FollowerLineChart
          data={snap.followerPoints}
          ariaLabel="Follower count by day from account creation through the latest update date in ingested data."
        />
        <p className="section-footnote">
          <strong>Note:</strong> Due to Xiaohongshu&apos;s official data export
          policy —— which only supports the most recent 30 days —— day-by-day
          follower data for the period June 15, 2025 to February 14, 2026 is
          unavailable. The chart renders this interval as a straight line and
          does not reflect actual growth during that time.
        </p>
      </section>

      <section
        className="section section-card section-trends"
        aria-labelledby="trends-heading"
      >
        <SectionHeading
          index="03"
          title="Content Performance"
          subtitle={trendSubtitle}
          headingId="trends-heading"
        />
        <DashboardTrendTabs tabs={trendTabs} />
      </section>

      <section className="section section-card" aria-labelledby="top-heading">
        <SectionHeading
          index="04"
          title={
            yearFilter == null
              ? "Top 10 Posts of All Time"
              : `Top 10 Posts (${yearFilter})`
          }
          subtitle={`Default: ranked by views
If values are equal, newer posts come first, then views, impressions, likes & saves, and new followers.
Due to Xiaohongshu export limitations, this section only displays and analyzes posts published on or after Sep 26, 2025.`}
          headingId="top-heading"
        />
        <DashboardYearFilter
          years={snap.years}
          selectedYear={yearFilter}
          selectedSort={sortKey}
        />
        {snap.topNotes.length === 0 ? (
          <p className="empty-hint">No notes match this filter yet.</p>
        ) : (
          <div className="top-post-list" role="list" aria-label="Top 10 posts">
            {snap.topNotes.map((row, idx) => (
              <div role="listitem" key={row.id}>
                <TopPostCard row={row} rank={idx + 1} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
