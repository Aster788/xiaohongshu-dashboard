/**
 * Public dashboard data contract (Server Component → optional Client charts).
 *
 * - KPI: `Settings` row id=1 (`followers`, `totalPosts`, `likesAndSaves`, `launchDate`);
 *   `daysSinceLaunch` = UTC calendar days from `launchDate` to today.
 * - Follower curve: daily net from `follower.new_follows_trend.*` − `follower.unfollows_trend.*`
 *   when those rows exist for a date (see `caser-xiaohongshu-data` / Excel routing); otherwise
 *   `follower.net_trend.*`. Span: max(launch, first data day) → latest date, aligned to KPI;
 *   burst when daily net ≥ 15.
 * - Trend mini-charts: last 30 calendar days ending at latest ingested date, summing keys
 *   `view.cover_ctr.*`, merged `engage.likes_trend.*` + `engage.saves_trend.*` (likes & saves),
 *   `view.views_trend.*`, and `publish.total_trend.*`.
 * - Top notes: `Note` ordered by selected sort (`views`, `impressions`, `likes & saves`,
 *   `shares`, `new followers`) with tie-breakers `publishedDate desc` → `views` →
 *   `impressions` → `likes + saves` → `followerGain`, cap 10; optional `year` filter on
 *   `publishedDate`; includes optional per-post `followerGain`; `years` = distinct calendar
 *   years present in `notes`.
 */

export type DashboardKpiDTO = {
  followers: number;
  totalPosts: number;
  likesAndSaves: number;
  daysSinceLaunch: number;
  launchDateIso: string;
};

export type FollowerPointDTO = {
  dateIso: string;
  followers: number;
  /** Present on days with ingested net trend (not on synthetic pre-data ramp). */
  netDelta?: number;
  /** Daily net follower change ≥ threshold (for tooltip / marker). */
  burst?: boolean;
};

export type TrendPointDTO = {
  dateIso: string;
  value: number;
};

export type PerformanceOverviewMetricKind =
  | "impressions"
  | "views"
  | "cover-ctr"
  | "avg-watch-duration"
  | "likes"
  | "saves"
  | "net-followers"
  | "profile-conv-rate";

export type PerformanceOverviewMetricDTO = {
  kind: PerformanceOverviewMetricKind;
  labelZh: string;
  labelEn: string;
  current: number | null;
  prior: number | null;
  pctChange: number | null;
  trend: "up" | "down" | "flat";
};

export type TopNotesSortKey =
  | "views"
  | "impressions"
  | "likes-saves"
  | "shares"
  | "new-followers";

export type TopNoteRowDTO = {
  id: string;
  title: string;
  format: string | null;
  publishedDateIso: string;
  impressions: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  followerGain: number | null;
  postUrl: string | null;
};

export type DashboardSnapshotDTO = {
  kpi: DashboardKpiDTO;
  performanceOverview: PerformanceOverviewMetricDTO[];
  followerPoints: FollowerPointDTO[];
  coverCtrTrend: TrendPointDTO[];
  /** Daily likes + saves from ingested trend sheets, summed per date. */
  likesAndSavesTrend: TrendPointDTO[];
  viewsTrend: TrendPointDTO[];
  publishTrend: TrendPointDTO[];
  years: number[];
  topNotesAll: TopNoteRowDTO[];
};
