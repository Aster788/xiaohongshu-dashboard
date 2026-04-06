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
 *   and `view.views_trend.*`.
 * - Top notes: `Note` ordered by `views desc nulls last`, cap 10; optional `year` filter on
 *   `publishedDate`; `years` = distinct calendar years present in `notes`.
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
  postUrl: string | null;
};

export type DashboardSnapshotDTO = {
  kpi: DashboardKpiDTO;
  followerPoints: FollowerPointDTO[];
  coverCtrTrend: TrendPointDTO[];
  /** Daily likes + saves from ingested trend sheets, summed per date. */
  likesAndSavesTrend: TrendPointDTO[];
  viewsTrend: TrendPointDTO[];
  years: number[];
  topNotes: TopNoteRowDTO[];
};
