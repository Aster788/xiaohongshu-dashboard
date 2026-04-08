import { FollowerLineChart } from "@/components/dashboard/FollowerLineChart";
import {
  DashboardTrendTabs,
  type TrendTab,
} from "@/components/dashboard/DashboardTrendTabs";
import { PerformanceOverviewMetrics } from "@/components/dashboard/PerformanceOverviewMetrics";
import { TopPostsPanel } from "@/components/dashboard/TopPostsPanel";
import {
  fallbackAnchorIsoFromTrendEnds,
  performanceComparisonWindowFromAnchorIso,
} from "@/lib/dashboard/comparisonWindow";
import { getDashboardSnapshotCached } from "@/lib/dashboard/queries";
import { computeContentTrendDateRange } from "@/lib/dashboard/trendDateRange";
import type { TopNotesSortKey } from "@/lib/dashboard/types";
import type { Metadata } from "next";
import Image from "next/image";
import { preconnect, prefetchDNS } from "react-dom";

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

/** Calendar labels for stored YYYY-MM-DD keys; shown in China Standard Time (Beijing). */
function formatDateFromIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Shanghai",
  });
}

function formatPerformanceComparisonNote(window: {
  priorStartIso: string;
  priorEndIso: string;
  currentStartIso: string;
  currentEndIso: string;
}): string {
  const a = `${formatDateFromIso(window.priorStartIso)}–${formatDateFromIso(window.priorEndIso)}`;
  const b = `${formatDateFromIso(window.currentStartIso)}–${formatDateFromIso(window.currentEndIso)}`;
  return `Comparison: ${a} vs ${b}`;
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[]; sort?: string | string[] }>;
}) {
  prefetchDNS("https://www.xiaohongshu.com");
  preconnect("https://www.xiaohongshu.com", { crossOrigin: "anonymous" });

  const sp = await searchParams;
  const yearFilter = parseYearFilter(sp.year);
  const sortKey = parseTopNotesSort(sp.sort);
  const snap = await getDashboardSnapshotCached(yearFilter, sortKey);
  const followerSubtitle =
    "Follower growth from account creation to the most recent date in the uploaded data, which may not coincide with the most recent post date.";

  const trendRange =
    snap.contentTrendDateRange ??
    computeContentTrendDateRange(
      snap.viewsTrend,
      snap.likesAndSavesTrend,
      snap.coverCtrTrend,
      snap.publishTrend,
    );
  const trendSubtitle = trendRange
    ? `Daily data from ${formatDateFromIso(trendRange.startIso)} to ${formatDateFromIso(trendRange.endIso)}.`
    : "No trend data yet";

  const performanceComparisonWindow =
    snap.performanceComparisonWindow ??
    (() => {
      const anchor = fallbackAnchorIsoFromTrendEnds(
        snap.viewsTrend,
        snap.likesAndSavesTrend,
        snap.coverCtrTrend,
        snap.publishTrend,
      );
      return anchor ? performanceComparisonWindowFromAnchorIso(anchor) : null;
    })();
  const trendTabs: TrendTab[] = [
    {
      key: "views",
      label: "Views",
      valueLabel: "Views",
      chartAriaLabel: "Views over the full ingested date range.",
      data: snap.viewsTrend,
    },
    {
      key: "likes-saves",
      label: "Likes & saves",
      valueLabel: "Likes & saves",
      chartAriaLabel:
        "Daily likes plus saves summed over the full ingested date range.",
      data: snap.likesAndSavesTrend,
    },
    {
      key: "cover-ctr",
      label: "Cover CTR",
      valueLabel: "CTR",
      chartAriaLabel: "Cover CTR over the full ingested date range.",
      data: snap.coverCtrTrend,
      note: "Note: CTR = Click-Through Rate (点击率)，CTR = Views ÷ Impression x 100%.",
    },
    {
      key: "published",
      label: "Published posts",
      valueLabel: "Published",
      chartAriaLabel: "Published posts over the full ingested date range.",
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
            href="https://www.xiaohongshu.com/user/profile/61f67b19000000001000a0ff"
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
              <div className="kpi-label">total likes &amp; saves</div>
              <div className="kpi-value">{formatInt(snap.kpi.likesAndSaves)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">days since launch</div>
              <div className="kpi-value">{formatInt(snap.kpi.daysSinceLaunch)}</div>
            </div>
          </div>
          <PerformanceOverviewMetrics metrics={snap.performanceOverview} />
          {performanceComparisonWindow ? (
            <p className="performance-overview-period-note">
              {formatPerformanceComparisonNote(performanceComparisonWindow)}
            </p>
          ) : null}
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
          ariaLabel="Follower count by day from account creation to the most recent date in the uploaded data, which may not coincide with the most recent post date."
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
          title="Top 10 Posts"
          subtitle="Due to Xiaohongshu export limitations, this section only displays and analyzes posts published on or after Sep 26, 2025."
          headingId="top-heading"
        />
        <TopPostsPanel
          years={snap.years}
          initialYear={yearFilter}
          initialSort={sortKey}
          notes={snap.topNotesAll}
        />
      </section>
    </main>
  );
}
