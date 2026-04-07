import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  DashboardSnapshotDTO,
  FollowerPointDTO,
  PerformanceOverviewMetricDTO,
  TopNotesSortKey,
  TopNoteRowDTO,
  TrendPointDTO,
} from "./types";

const BURST_NET_THRESHOLD = 15;

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

async function sumByDatePrefix(prefix: string): Promise<Map<string, number>> {
  const rows = await prisma.accountDaily.findMany({
    where: { metricKey: { startsWith: prefix } },
    orderBy: [{ date: "asc" }, { metricKey: "asc" }],
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = toIsoDateUTC(r.date);
    map.set(k, (map.get(k) ?? 0) + Number(r.value));
  }
  return map;
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

function last30DayPoints(map: Map<string, number>): TrendPointDTO[] {
  if (map.size === 0) return [];
  const sorted = [...map.keys()].sort();
  const endStr = sorted[sorted.length - 1]!;
  const endDate = parseIsoDateUTC(endStr);
  const start = addUtcDays(endDate, -29);
  const pts: TrendPointDTO[] = [];
  for (
    let d = new Date(start.getTime());
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

function buildPerformanceOverviewMetrics(args: {
  impressionsMap: Map<string, number>;
  viewsMap: Map<string, number>;
  coverMap: Map<string, number>;
  avgWatchDurationMap: Map<string, number>;
  likesMap: Map<string, number>;
  savesMap: Map<string, number>;
  netByDate: Map<string, number>;
  profileConvRateMap: Map<string, number>;
}): PerformanceOverviewMetricDTO[] {
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

  const empty = (kind: PerformanceOverviewMetricDTO["kind"], labelZh: string, labelEn: string) =>
    makePerformanceMetric(kind, labelZh, labelEn, null, null);

  if (!anchorIso) {
    return [
      empty("impressions", "曝光", "Impressions"),
      empty("views", "观看", "Views"),
      empty("cover-ctr", "封面点击率", "Cover CTR"),
      empty("avg-watch-duration", "平均观看时长", "Avg watch duration"),
      empty("likes", "点赞", "Likes"),
      empty("saves", "收藏", "Saves"),
      empty("net-followers", "净涨粉", "Net followers"),
      empty("profile-conv-rate", "主页转粉率", "Profile conv. rate"),
    ];
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

  return [
    makePerformanceMetric(
      "impressions",
      "曝光",
      "Impressions",
      impressions.current,
      impressions.prior,
    ),
    makePerformanceMetric("views", "观看", "Views", views.current, views.prior),
    makePerformanceMetric(
      "cover-ctr",
      "封面点击率",
      "Cover CTR",
      coverCtr.current,
      coverCtr.prior,
    ),
    makePerformanceMetric(
      "avg-watch-duration",
      "平均观看时长",
      "Avg watch duration",
      avgWatchDuration.current,
      avgWatchDuration.prior,
    ),
    makePerformanceMetric("likes", "点赞", "Likes", likes.current, likes.prior),
    makePerformanceMetric("saves", "收藏", "Saves", saves.current, saves.prior),
    makePerformanceMetric(
      "net-followers",
      "净涨粉",
      "Net followers",
      netFollowers.current,
      netFollowers.prior,
    ),
    makePerformanceMetric(
      "profile-conv-rate",
      "主页转粉率",
      "Profile conv. rate",
      profileConvRate.current,
      profileConvRate.prior,
    ),
  ];
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

function likesAndSavesOrderExpr() {
  return Prisma.sql`(COALESCE(likes, 0) + COALESCE(saves, 0))`;
}

function fallbackTopNotesOrderSql() {
  return Prisma.sql`
    published_date DESC,
    views DESC NULLS LAST,
    impressions DESC NULLS LAST,
    ${likesAndSavesOrderExpr()} DESC,
    follower_gain DESC NULLS LAST
  `;
}

function topNotesOrderBySql(sortKey: TopNotesSortKey) {
  switch (sortKey) {
    case "impressions":
      return Prisma.sql`
        ORDER BY impressions DESC NULLS LAST, ${fallbackTopNotesOrderSql()}
      `;
    case "likes-saves":
      return Prisma.sql`
        ORDER BY ${likesAndSavesOrderExpr()} DESC, ${fallbackTopNotesOrderSql()}
      `;
    case "shares":
      return Prisma.sql`
        ORDER BY shares DESC NULLS LAST, ${fallbackTopNotesOrderSql()}
      `;
    case "new-followers":
      return Prisma.sql`
        ORDER BY follower_gain DESC NULLS LAST, ${fallbackTopNotesOrderSql()}
      `;
    case "views":
    default:
      return Prisma.sql`
        ORDER BY views DESC NULLS LAST, ${fallbackTopNotesOrderSql()}
      `;
  }
}

async function getTopNotes(
  yearFilter: number | null,
  sortKey: TopNotesSortKey,
) {
  const yearWhere =
    yearFilter !== null
      ? Prisma.sql`
          WHERE published_date >= ${new Date(Date.UTC(yearFilter, 0, 1))}
            AND published_date < ${new Date(Date.UTC(yearFilter + 1, 0, 1))}
        `
      : Prisma.empty;

  return prisma.$queryRaw<
    Array<{
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
    }>
  >(Prisma.sql`
    SELECT
      id,
      title,
      format,
      published_date AS "publishedDate",
      impressions,
      views,
      likes,
      comments,
      saves,
      shares,
      follower_gain AS "followerGain",
      post_url AS "postUrl"
    FROM notes
    ${yearWhere}
    ${topNotesOrderBySql(sortKey)}
    LIMIT 10
  `);
}

export async function getDashboardSnapshot(
  yearFilter: number | null,
  sortKey: TopNotesSortKey,
): Promise<DashboardSnapshotDTO> {
  const settings =
    (await prisma.settings.findUnique({ where: { id: 1 } })) ??
    ({
      followers: 0,
      totalPosts: 0,
      likesAndSaves: 0,
      launchDate: new Date(Date.UTC(2025, 5, 15)),
    } as const);

  const [
    netTrendMap,
    newFollowsMap,
    unfollowsMap,
    coverMap,
    impressionsMap,
    likesMap,
    savesMap,
    viewsMap,
    avgWatchDurationMap,
    profileConvRateMap,
    publishMap,
    yearRows,
    topNotes,
  ] = await Promise.all([
      sumByDatePrefix(METRIC_PREFIX.netFollower),
      sumByDatePrefix(METRIC_PREFIX.newFollows),
      sumByDatePrefix(METRIC_PREFIX.unfollows),
      sumByDatePrefix(METRIC_PREFIX.coverCtr),
      sumByDatePrefix(METRIC_PREFIX.impressions),
      sumByDatePrefix(METRIC_PREFIX.likes),
      sumByDatePrefix(METRIC_PREFIX.saves),
      sumByDatePrefix(METRIC_PREFIX.views),
      sumByDatePrefix(METRIC_PREFIX.avgWatchDuration),
      sumByDatePrefix(METRIC_PREFIX.profileConvRate),
      sumByDatePrefix(METRIC_PREFIX.publishTotal),
      prisma.$queryRaw<{ y: number }[]>`
        SELECT DISTINCT EXTRACT(YEAR FROM published_date)::int AS y
        FROM notes
        ORDER BY y DESC
      `,
      getTopNotes(yearFilter, sortKey),
    ]);

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

  return {
    kpi: {
      followers: settings.followers,
      totalPosts: settings.totalPosts,
      likesAndSaves: settings.likesAndSaves,
      daysSinceLaunch: daysSinceLaunchUTC(settings.launchDate),
      launchDateIso: toIsoDateUTC(settings.launchDate),
    },
    performanceOverview: buildPerformanceOverviewMetrics({
      impressionsMap,
      viewsMap,
      coverMap,
      avgWatchDurationMap,
      likesMap,
      savesMap,
      netByDate,
      profileConvRateMap,
    }),
    followerPoints: buildFollowerCurve(
      settings.launchDate,
      settings.followers,
      netByDate,
    ),
    coverCtrTrend: last30DayPoints(coverMap),
    likesAndSavesTrend: last30DayPoints(mergeDailyMaps(likesMap, savesMap)),
    viewsTrend: last30DayPoints(viewsMap),
    publishTrend: last30DayPoints(publishMap),
    years,
    topNotes: topNotes.map(mapTopNoteRow),
  };
}
