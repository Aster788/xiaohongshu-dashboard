import { FollowerLineChart } from "@/components/dashboard/FollowerLineChart";
import { DashboardYearFilter } from "@/components/dashboard/DashboardYearFilter";
import { TrendLineChart } from "@/components/dashboard/TrendLineChart";
import { getDashboardSnapshot } from "@/lib/dashboard/queries";
import type { TopNoteRowDTO } from "@/lib/dashboard/types";
import type { Metadata } from "next";
import Image from "next/image";

/** Year filter and DB snapshot must reflect `?year=` on every request (avoid static cache). */
export const dynamic = "force-dynamic";

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

function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

function formatMetricValue(value: number | string | null): string {
  if (value == null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : String(value);
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
      <div className="top-post-metrics" aria-label="Post metrics">
        <span>{formatMetricValue(row.views)} views</span>
        <span>{formatMetricValue(row.likes)} likes</span>
        <span>{formatMetricValue(row.saves)} saves</span>
      </div>
      <div className="top-post-body">
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
        <div className="top-post-meta-row">
          <p className="top-post-meta">
            {row.format ?? "Post"} · {formatPublishedDate(row.publishedDateIso)}
          </p>
          <div className="top-post-secondary">
            <span>Impressions {formatMetricValue(row.impressions)}</span>
            <span>Comments {formatMetricValue(row.comments)}</span>
            <span>Shares {formatMetricValue(row.shares)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const sp = await searchParams;
  const yearFilter = parseYearFilter(sp.year);
  const snap = await getDashboardSnapshot(yearFilter);
  const followerSubtitle =
    "Follower growth from account creation date to the latest update date.";

  return (
    <main className="dashboard-shell">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-header">
          <div className="dashboard-title-block">
            <h1 id="dashboard-title">Xiaohongshu Analytics Dashboard</h1>
          </div>
        </div>
        <div className="hero-stat-block hero-stat-kpi-align">
          <div className="hero-stat-value">
            <Image
              className="hero-stat-logo"
              src="/caser-logo-01.png"
              alt="Caser"
              width={640}
              height={640}
              priority
              sizes="(max-width: 760px) 100vw, min(1200px, 100vw)"
            />
          </div>
        </div>
      </section>

      <section className="kpi-grid kpi-grid-floating" aria-label="Key performance indicators">
        <div className="kpi-card">
          <div className="kpi-label">Total followers</div>
          <div className="kpi-value">{formatInt(snap.kpi.followers)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total posts</div>
          <div className="kpi-value">{formatInt(snap.kpi.totalPosts)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Likes &amp; saves</div>
          <div className="kpi-value">{formatInt(snap.kpi.likesAndSaves)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Days since launch</div>
          <div className="kpi-value">{formatInt(snap.kpi.daysSinceLaunch)}</div>
        </div>
      </section>

      <section className="section section-card" aria-labelledby="follower-heading">
        <SectionHeading
          index="01"
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
          policy - which only supports the most recent 30 days - day-by-day
          follower data for the period June 15, 2025 to February 14, 2026 is
          unavailable. The chart renders this interval as a straight line and
          does not reflect actual growth during that time.
        </p>
      </section>

      <section className="section section-card" aria-labelledby="top-heading">
        <SectionHeading
          index="02"
          title={
            yearFilter == null
              ? "Top 10 Posts of All Time"
              : `Top 10 Posts (${yearFilter})`
          }
          subtitle="Ranked by views"
          headingId="top-heading"
        />
        <DashboardYearFilter years={snap.years} selectedYear={yearFilter} />
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

      <section
        className="section section-card section-trends"
        aria-labelledby="trends-heading"
      >
        <SectionHeading
          index="03"
          title="Engagement &amp; view trends"
          headingId="trends-heading"
        />
        <div className="chart-grid-3">
          <div className="mini-chart">
            <h3>Cover click rate</h3>
            <TrendLineChart
              data={snap.coverCtrTrend}
              valueLabel="CTR"
              chartAriaLabel="Cover click rate over the last 30 ingested days."
            />
          </div>
          <div className="mini-chart">
            <h3>Likes &amp; saves</h3>
            <TrendLineChart
              data={snap.likesAndSavesTrend}
              valueLabel="Likes & saves"
              chartAriaLabel="Daily likes plus saves summed over the last 30 ingested days."
            />
          </div>
          <div className="mini-chart">
            <h3>Views</h3>
            <TrendLineChart
              data={snap.viewsTrend}
              valueLabel="Views"
              chartAriaLabel="Views over the last 30 ingested days."
            />
          </div>
        </div>
      </section>
    </main>
  );
}
