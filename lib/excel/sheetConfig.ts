/**
 * Sheet routing for Xiaohongshu official exports (PRD § Excel 与 Sheet 范围).
 *
 * Calibrated against **local** `caser-xiaohongshu-data/*.xlsx` (2026-03-17 export batch in fixture).
 * Official package may use **one workbook per topic** (e.g. `笔记列表明细表.xlsx` with sheet `Sheet1`).
 */

export type TrendSheetKind =
  | "cover_click_rate"
  | "publish_total_trend"
  | "publish_video_trend"
  | "publish_image_trend"
  | "net_follower_trend"
  | "follower_new_trend"
  | "follower_unfollow_trend"
  | "profile_visitors_trend"
  | "profile_conv_rate_trend"
  | "likes_trend"
  | "comments_trend"
  | "saves_trend"
  | "shares_trend"
  | "impressions_trend"
  | "views_trend"
  | "avg_watch_duration_trend"
  | "total_watch_duration_trend"
  | "video_completion_trend";

/** Normalized sheet name: trim + collapse internal whitespace. */
export function normalizeSheetLabel(name: string): string {
  return name.trim().replace(/\s+/g, "");
}

/** `笔记列表明细表.xlsx` uses internal name `Sheet1` — match by **file name** in domainWorkbook. */
const NOTE_FILE_SUBSTRINGS = ["笔记列表", "笔记明细"] as const;

const NOTE_SHEET_SUBSTRINGS = ["笔记列表明细", "笔记明细"] as const;

/** Vertical snapshot: row1 指标 | 数值 (no 日期 column). */
const SNAPSHOT_SHEETS: { substr: string; metricKeyPrefix: string }[] = [
  { substr: "账号总体互动数据", metricKeyPrefix: "engage.account_total.snapshot" },
  { substr: "账号总体发布数据", metricKeyPrefix: "publish.account_total.snapshot" },
  { substr: "账号总体涨粉数据", metricKeyPrefix: "follower.account_total.snapshot" },
  { substr: "账号总体观看数据", metricKeyPrefix: "view.account_total.snapshot" },
];

/** Longest alias first so e.g. 封面点击率趋势 wins over 封面点击率. */
const TREND_ALIAS_ROWS: { kind: TrendSheetKind; alias: string }[] = [
  { kind: "profile_conv_rate_trend", alias: "主页转粉率趋势" },
  { kind: "avg_watch_duration_trend", alias: "平均观看时长趋势" },
  { kind: "total_watch_duration_trend", alias: "观看总时长趋势" },
  { kind: "video_completion_trend", alias: "视频完播率趋势" },
  { kind: "cover_click_rate", alias: "封面点击率趋势" },
  { kind: "follower_new_trend", alias: "新增关注趋势" },
  { kind: "follower_unfollow_trend", alias: "取消关注趋势" },
  { kind: "profile_visitors_trend", alias: "主页访客趋势" },
  { kind: "publish_image_trend", alias: "发布图文趋势" },
  { kind: "publish_video_trend", alias: "发布视频趋势" },
  { kind: "publish_total_trend", alias: "总发布趋势" },
  { kind: "impressions_trend", alias: "曝光趋势" },
  { kind: "net_follower_trend", alias: "净涨粉趋势" },
  { kind: "net_follower_trend", alias: "净粉丝趋势" },
  { kind: "likes_trend", alias: "点赞量趋势" },
  { kind: "comments_trend", alias: "评论量趋势" },
  { kind: "saves_trend", alias: "收藏量趋势" },
  { kind: "shares_trend", alias: "分享量趋势" },
  { kind: "shares_trend", alias: "转发趋势" },
  { kind: "likes_trend", alias: "获赞趋势" },
  { kind: "likes_trend", alias: "点赞趋势" },
  { kind: "comments_trend", alias: "评论趋势" },
  { kind: "saves_trend", alias: "收藏趋势" },
  { kind: "shares_trend", alias: "分享趋势" },
  { kind: "views_trend", alias: "观看趋势" },
  { kind: "cover_click_rate", alias: "封面点击率" },
];

export type RoutedSheet =
  | { type: "note_detail" }
  | { type: "account_snapshot"; metricKeyPrefix: string }
  | { type: "account_daily_trend"; kind: TrendSheetKind }
  | { type: "unknown" };

function includesNormalized(sheetNorm: string, fragment: string): boolean {
  return sheetNorm.includes(normalizeSheetLabel(fragment));
}

/** True if workbook basename suggests the note list export (sheet may be `Sheet1`). */
export function isNoteListWorkbookFileName(fileName: string | undefined): boolean {
  if (!fileName) return false;
  const base = fileName.replace(/\.xlsx$/i, "").trim();
  const n = normalizeSheetLabel(base);
  for (const sub of NOTE_FILE_SUBSTRINGS) {
    if (n.includes(normalizeSheetLabel(sub))) return true;
  }
  return false;
}

export function routeSheetByName(sheetName: string): RoutedSheet {
  const n = normalizeSheetLabel(sheetName);

  for (const sub of NOTE_SHEET_SUBSTRINGS) {
    if (n.includes(normalizeSheetLabel(sub))) {
      return { type: "note_detail" };
    }
  }

  for (const snap of SNAPSHOT_SHEETS) {
    if (includesNormalized(n, snap.substr)) {
      return { type: "account_snapshot", metricKeyPrefix: snap.metricKeyPrefix };
    }
  }

  for (const { kind, alias } of TREND_ALIAS_ROWS) {
    if (includesNormalized(n, alias)) {
      return { type: "account_daily_trend", kind };
    }
  }

  return { type: "unknown" };
}

export const TREND_METRIC_PREFIX: Record<TrendSheetKind, string> = {
  cover_click_rate: "view.cover_ctr",
  publish_total_trend: "publish.total_trend",
  publish_video_trend: "publish.video_trend",
  publish_image_trend: "publish.image_trend",
  net_follower_trend: "follower.net_trend",
  follower_new_trend: "follower.new_follows_trend",
  follower_unfollow_trend: "follower.unfollows_trend",
  profile_visitors_trend: "profile.visitors_trend",
  profile_conv_rate_trend: "profile.conv_rate_trend",
  likes_trend: "engage.likes_trend",
  comments_trend: "engage.comments_trend",
  saves_trend: "engage.saves_trend",
  shares_trend: "engage.shares_trend",
  impressions_trend: "view.impressions_trend",
  views_trend: "view.views_trend",
  avg_watch_duration_trend: "view.avg_watch_duration_trend",
  total_watch_duration_trend: "view.total_watch_duration_trend",
  video_completion_trend: "view.video_completion_trend",
};
