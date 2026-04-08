import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { performanceComparisonWindowFromAnchorIso } from "./comparisonWindow";
import type {
  DashboardSnapshotDTO,
  FollowerPointDTO,
  PerformanceOverviewMetricDTO,
  TopNotesSortKey,
  TopNoteRowDTO,
  TrendPointDTO,
} from "./types";
import { computeContentTrendDateRange } from "./trendDateRange";

const BURST_NET_THRESHOLD = 15;
export const DASHBOARD_CACHE_TAG = "dashboard-snapshot";

/** Bump when snapshot shape changes so `unstable_cache` does not serve stale objects. */
const DASHBOARD_SNAPSHOT_CACHE_REVISION = "2";

const METRIC_PREFIX = {
  netFollower: "follower.net_trend.",
  newFollows: "follower.new_follows_trend.",
  unfollows: "follower.unfollows_trend.",
  coverCtr: "view.cover_ctr.",
  impressions: "view.impressions_trend.",
  likes: "engage.likes_trend.",
  saves: "engage.saves_trend.",
  views: "view.views_trend.",
  avgWatchDuration: "view.avg_watch_duration_trend.",
  profileConvRate: "profile.conv_rate_trend.",
  publishTotal: "publish.total_trend.",
} as const;

function mergeDailyMaps(
  a: Map<string, number>,
  b: Map<string, number>,
): Map<string, number> {
  const out = new Map(a);
  for (const [k, v] of b) {
    out.set(k, (out.get(k) ?? 0) + v);
  }
  return out;
}

function toIsoDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDateUTC(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function addUtcDays(d: Date, days: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  );
}

/** Non-negative calendar-day distance from a to b (UTC date parts). */
function utcCalendarDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const ub = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((ub - ua) / 86_400_000);
}

async function sumByDatePrefixes(
  prefixes: readonly string[],
): Promise<Record<string, Map<string, number>>> {
  const out: Record<string, Map<string, number>> = {};
  for (const prefix of prefixes) {
    out[prefix] = new Map<string, number>();
  }
  if (prefixes.length === 0) return out;

  const rows = await prisma.accountDaily.findMany({
    where: {
      OR: prefixes.map((prefix) => ({ metricKey: { startsWith: prefix } })),
    },
    orderBy: [{ date: "asc" }, { metricKey: "asc" }],
  });

  for (const r of rows) {
    const prefix = prefixes.find((p) => r.metricKey.startsWith(p));
    if (!prefix) continue;
    const map = out[prefix]!;
    const dateIso = toIsoDateUTC(r.date);
    map.set(dateIso, (map.get(dateIso) ?? 0) + Number(r.value));
  }
  return out;
}

/**
 * Daily net followers: per-day `new_follows − unfollows` when either series has a row
 * for that date (matches `caser-xiaohongshu-data` 净涨粉 vs 新增/取消 sheets); otherwise
 * falls back to summed `follower.net_trend.*` for that date.
 */
function mergeNetFollowerByDate(
  netMap: Map<string, number>,
  newMap: Map<string, number>,
  unfMap: Map<string, number>,
): Map<string, number> {
  const allDates = new Set<string>([
    ...netMap.keys(),
    ...newMap.keys(),
    ...unfMap.keys(),
  ]);
  if (allDates.size === 0) return new Map();
  const merged = new Map<string, number>();
  for (const d of [...allDates].sort()) {
    const derived = (newMap.get(d) ?? 0) - (unfMap.get(d) ?? 0);
    const useDerived = newMap.has(d) || unfMap.has(d);
    merged.set(d, useDerived ? derived : (netMap.get(d) ?? 0));
  }
  return merged;
}

function fullDateSpanPoints(map: Map<string, number>): TrendPointDTO[] {
  if (map.size === 0) return [];
  const sorted = [...map.keys()].sort();
  const startStr = sorted[0]!;
  const endStr = sorted[sorted.length - 1]!;
  const startDate = parseIsoDateUTC(startStr);
  const endDate = parseIsoDateUTC(endStr);
  const pts: TrendPointDTO[] = [];
  for (
    let d = new Date(startDate.getTime());
    utcCalendarDaysBetween(d, endDate) >= 0;
    d = addUtcDays(d, 1)
  ) {
    const ds = toIsoDateUTC(d);
    pts.push({ dateIso: ds, value: map.get(ds) ?? 0 });
  }
  return pts;
}

function latestIsoDateFromMaps(...maps: Array<Map<string, number>>): string | null {
  let latest: string | null = null;
  for (const map of maps) {
    for (const iso of map.keys()) {
      if (latest === null || iso > latest) latest = iso;
    }
  }
  return latest;
}

function aggregateWindow(
  map: Map<string, number>,
  start: Date,
  end: Date,
  mode: "sum" | "avg",
): number | null {
  let total = 0;
  let count = 0;

  for (
    let d = new Date(start.getTime());
    utcCalendarDaysBetween(d, end) >= 0;
    d = addUtcDays(d, 1)
  ) {
    const value = map.get(toIsoDateUTC(d));
    if (value == null) continue;
    total += value;
    count += 1;
  }

  if (count === 0) return null;
  return mode === "avg" ? total / count : total;
}

function computePctChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function metricTrendFromPctChange(
  pctChange: number | null,
): PerformanceOverviewMetricDTO["trend"] {
  if (pctChange == null || pctChange === 0) return "flat";
  return pctChange > 0 ? "up" : "down";
}

function makePerformanceMetric(
  kind: PerformanceOverviewMetricDTO["kind"],
  labelZh: string,
  labelEn: string,
  current: number | null,
  prior: number | null,
): PerformanceOverviewMetricDTO {
  const pctChange = computePctChange(current, prior);
  return {
    kind,
    labelZh,
    labelEn,
    current,
    prior,
    pctChange,
    trend: metricTrendFromPctChange(pctChange),
  };
}

function emptyPerformanceOverviewMetrics(): PerformanceOverviewMetricDTO[] {
  const empty = (kind: PerformanceOverviewMetricDTO["kind"], labelZh: string, labelEn: string) =>
    makePerformanceMetric(kind, labelZh, labelEn, null, null);
  return [
    empty("impressions", "曝光量", "impressions"),
    empty("views", "观看量", "views"),
    empty("cover-ctr", "封面点击率", "cover ctr"),
    empty("avg-watch-duration", "平均观看时长", "avg watch duration"),
    empty("likes", "点赞量", "likes"),
    empty("saves", "收藏量", "saves"),
    empty("net-followers", "净涨粉", "net followers"),
    empty("profile-conv-rate", "主页转粉率", "profile conversion rate"),
  ];
}

function buildPerformanceOverviewMetrics(args: {
  impressionsMap: Map<string, number>;
  viewsMap: Map<string, number>;
  coverMap: Map<string, number>;
  avgWatchDurationMap: Map<string, number>;
  likesMap: Map<string, number>;
  savesMap: Map<string, number>;
  netByDate: Map<string, number>;
  profileConvRateMap: Map<string, number>;
}): {
  metrics: PerformanceOverviewMetricDTO[];
  window: {
    currentStartIso: string;
    currentEndIso: string;
    priorStartIso: string;
    priorEndIso: string;
  } | null;
} {
  const anchorIso = latestIsoDateFromMaps(
    args.impressionsMap,
    args.viewsMap,
    args.coverMap,
    args.avgWatchDurationMap,
    args.likesMap,
    args.savesMap,
    args.netByDate,
    args.profileConvRateMap,
  );

  if (!anchorIso) {
    return { metrics: emptyPerformanceOverviewMetrics(), window: null };
  }

  const currentEnd = parseIsoDateUTC(anchorIso);
  const currentStart = addUtcDays(currentEnd, -29);
  const priorEnd = addUtcDays(currentEnd, -30);
  const priorStart = addUtcDays(currentEnd, -59);

  const sumWindowMetric = (map: Map<string, number>) => ({
    current: aggregateWindow(map, currentStart, currentEnd, "sum"),
    prior: aggregateWindow(map, priorStart, priorEnd, "sum"),
  });
  const avgWindowMetric = (map: Map<string, number>) => ({
    current: aggregateWindow(map, currentStart, currentEnd, "avg"),
    prior: aggregateWindow(map, priorStart, priorEnd, "avg"),
  });

  const impressions = sumWindowMetric(args.impressionsMap);
  const views = sumWindowMetric(args.viewsMap);
  const coverCtr = avgWindowMetric(args.coverMap);
  const avgWatchDuration = avgWindowMetric(args.avgWatchDurationMap);
  const likes = sumWindowMetric(args.likesMap);
  const saves = sumWindowMetric(args.savesMap);
  const netFollowers = sumWindowMetric(args.netByDate);
  const profileConvRate = avgWindowMetric(args.profileConvRateMap);

  const window = performanceComparisonWindowFromAnchorIso(anchorIso);

  return {
    metrics: [
      makePerformanceMetric(
        "impressions",
        "曝光量",
        "impressions",
        impressions.current,
        impressions.prior,
      ),
      makePerformanceMetric("views", "观看量", "views", views.current, views.prior),
      makePerformanceMetric(
        "cover-ctr",
        "封面点击率",
        "cover ctr",
        coverCtr.current,
        coverCtr.prior,
      ),
      makePerformanceMetric(
        "avg-watch-duration",
        "平均观看时长",
        "avg watch duration",
        avgWatchDuration.current,
        avgWatchDuration.prior,
      ),
      makePerformanceMetric("likes", "点赞量", "likes", likes.current, likes.prior),
      makePerformanceMetric("saves", "收藏量", "saves", saves.current, saves.prior),
      makePerformanceMetric(
        "net-followers",
        "净涨粉",
        "net followers",
        netFollowers.current,
        netFollowers.prior,
      ),
      makePerformanceMetric(
        "profile-conv-rate",
        "主页转粉率",
        "profile conversion rate",
        profileConvRate.current,
        profileConvRate.prior,
      ),
    ],
    window,
  };
}

function buildFollowerCurve(
  launchDate: Date,
  kpiFollowers: number,
  netByDate: Map<string, number>,
): FollowerPointDTO[] {
  if (netByDate.size === 0) {
    const today = new Date();
    const span = Math.max(1, utcCalendarDaysBetween(launchDate, today));
    const pts: FollowerPointDTO[] = [];
    for (let i = 0; i <= span; i++) {
      const day = addUtcDays(launchDate, i);
      if (utcCalendarDaysBetween(day, today) < 0) continue;
      pts.push({
        dateIso: toIsoDateUTC(day),
        followers: Math.round((kpiFollowers * i) / span),
      });
    }
    if (pts.length > 0) {
      pts[pts.length - 1]!.followers = kpiFollowers;
    }
    return pts;
  }

  const sortedDates = [...netByDate.keys()].sort();
  const firstData = parseIsoDateUTC(sortedDates[0]!);
  const dataEnd = parseIsoDateUTC(sortedDates[sortedDates.length - 1]!);
  const effectiveStart =
    firstData.getTime() < launchDate.getTime() ? launchDate : firstData;

  let totalNet = 0;
  for (
    let d = new Date(effectiveStart.getTime());
    utcCalendarDaysBetween(d, dataEnd) >= 0;
    d = addUtcDays(d, 1)
  ) {
    totalNet += netByDate.get(toIsoDateUTC(d)) ?? 0;
  }

  const F_start = kpiFollowers - totalNet;
  const points: FollowerPointDTO[] = [];

  const dayBeforeEffective = addUtcDays(effectiveStart, -1);
  const rampDays =
    utcCalendarDaysBetween(launchDate, dayBeforeEffective) >= 0
      ? utcCalendarDaysBetween(launchDate, dayBeforeEffective) + 1
      : 0;

  if (rampDays > 0) {
    for (let i = 0; i < rampDays; i++) {
      const day = addUtcDays(launchDate, i);
      points.push({
        dateIso: toIsoDateUTC(day),
        followers: Math.round((F_start * i) / rampDays),
      });
    }
  }

  let cum = F_start;
  for (
    let d = new Date(effectiveStart.getTime());
    utcCalendarDaysBetween(d, dataEnd) >= 0;
    d = addUtcDays(d, 1)
  ) {
    const ds = toIsoDateUTC(d);
    const net = netByDate.get(ds) ?? 0;
    cum += net;
    points.push({
      dateIso: ds,
      followers: Math.round(cum),
      netDelta: net,
      burst: net >= BURST_NET_THRESHOLD,
    });
  }

  if (points.length > 0) {
    points[points.length - 1]!.followers = kpiFollowers;
  }

  return points;
}

function daysSinceLaunchUTC(launch: Date): number {
  const now = new Date();
  return utcCalendarDaysBetween(launch, now);
}

function mapTopNoteRow(n: {
  id: string;
  title: string;
  format: string | null;
  publishedDate: Date;
  impressions: bigint | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  followerGain: number | null;
  postUrl: string | null;
}): TopNoteRowDTO {
  return {
    id: n.id,
    title: n.title,
    format: n.format,
    publishedDateIso: toIsoDateUTC(n.publishedDate),
    impressions: n.impressions !== null ? n.impressions.toString() : null,
    views: n.views,
    likes: n.likes,
    comments: n.comments,
    saves: n.saves,
    shares: n.shares,
    followerGain: n.followerGain,
    postUrl: n.postUrl,
  };
}

async function getAllTopNoteCandidates() {
  return prisma.note.findMany({
    select: {
      id: true,
      title: true,
      format: true,
      publishedDate: true,
      impressions: true,
      views: true,
      likes: true,
      comments: true,
      saves: true,
      shares: true,
      followerGain: true,
      postUrl: true,
    },
    orderBy: { publishedDate: "desc" },
  });
}

export async function getDashboardSnapshot(
  _yearFilter: number | null,
  _sortKey: TopNotesSortKey,
): Promise<DashboardSnapshotDTO> {
  const [
    settingsRow,
    metricMapsByPrefix,
    yearRows,
    allTopNoteCandidates,
  ] = await Promise.all([
    prisma.settings.findUnique({ where: { id: 1 } }),
    sumByDatePrefixes(Object.values(METRIC_PREFIX)),
    prisma.$queryRaw<{ y: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM published_date)::int AS y
      FROM notes
      ORDER BY y DESC
    `,
    getAllTopNoteCandidates(),
  ]);

  const settings =
    settingsRow ??
    ({
      followers: 0,
      totalPosts: 0,
      likesAndSaves: 0,
      launchDate: new Date(Date.UTC(2025, 5, 15)),
    } as const);

  const netTrendMap = metricMapsByPrefix[METRIC_PREFIX.netFollower] ?? new Map<string, number>();
  const newFollowsMap = metricMapsByPrefix[METRIC_PREFIX.newFollows] ?? new Map<string, number>();
  const unfollowsMap = metricMapsByPrefix[METRIC_PREFIX.unfollows] ?? new Map<string, number>();
  const coverMap = metricMapsByPrefix[METRIC_PREFIX.coverCtr] ?? new Map<string, number>();
  const impressionsMap = metricMapsByPrefix[METRIC_PREFIX.impressions] ?? new Map<string, number>();
  const likesMap = metricMapsByPrefix[METRIC_PREFIX.likes] ?? new Map<string, number>();
  const savesMap = metricMapsByPrefix[METRIC_PREFIX.saves] ?? new Map<string, number>();
  const viewsMap = metricMapsByPrefix[METRIC_PREFIX.views] ?? new Map<string, number>();
  const avgWatchDurationMap =
    metricMapsByPrefix[METRIC_PREFIX.avgWatchDuration] ?? new Map<string, number>();
  const profileConvRateMap =
    metricMapsByPrefix[METRIC_PREFIX.profileConvRate] ?? new Map<string, number>();
  const publishMap = metricMapsByPrefix[METRIC_PREFIX.publishTotal] ?? new Map<string, number>();

  const netByDate = mergeNetFollowerByDate(
    netTrendMap,
    newFollowsMap,
    unfollowsMap,
  );

  const years = yearRows
    .map((r) => {
      const v = r.y as unknown;
      if (typeof v === "bigint") return Number(v);
      if (typeof v === "number") return v;
      return Number(v);
    })
    .filter((y) => Number.isInteger(y) && y >= 1970 && y <= 2100);

  const { metrics: performanceOverview, window: performanceComparisonWindow } =
    buildPerformanceOverviewMetrics({
      impressionsMap,
      viewsMap,
      coverMap,
      avgWatchDurationMap,
      likesMap,
      savesMap,
      netByDate,
      profileConvRateMap,
    });

  const coverCtrTrend = fullDateSpanPoints(coverMap);
  const likesAndSavesTrend = fullDateSpanPoints(mergeDailyMaps(likesMap, savesMap));
  const viewsTrend = fullDateSpanPoints(viewsMap);
  const publishTrend = fullDateSpanPoints(publishMap);
  const contentTrendDateRange = computeContentTrendDateRange(
    viewsTrend,
    likesAndSavesTrend,
    coverCtrTrend,
    publishTrend,
  );

  return {
    kpi: {
      followers: settings.followers,
      totalPosts: settings.totalPosts,
      likesAndSaves: settings.likesAndSaves,
      daysSinceLaunch: daysSinceLaunchUTC(settings.launchDate),
      launchDateIso: toIsoDateUTC(settings.launchDate),
    },
    performanceOverview,
    performanceComparisonWindow,
    contentTrendDateRange,
    followerPoints: buildFollowerCurve(
      settings.launchDate,
      settings.followers,
      netByDate,
    ),
    coverCtrTrend,
    likesAndSavesTrend,
    viewsTrend,
    publishTrend,
    years,
    topNotesAll: allTopNoteCandidates.map(mapTopNoteRow),
  };
}

export async function getDashboardSnapshotCached(
  yearFilter: number | null,
  sortKey: TopNotesSortKey,
): Promise<DashboardSnapshotDTO> {
  const cacheKey = `${yearFilter ?? "all"}:${sortKey}`;
  const cached = unstable_cache(
    () => getDashboardSnapshot(yearFilter, sortKey),
    ["dashboard-snapshot", DASHBOARD_SNAPSHOT_CACHE_REVISION, cacheKey],
    { revalidate: 120, tags: [DASHBOARD_CACHE_TAG] },
  );
  return cached();
}
