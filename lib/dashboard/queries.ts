import { prisma } from "@/lib/db";
import type {
  DashboardSnapshotDTO,
  FollowerPointDTO,
  TopNoteRowDTO,
  TrendPointDTO,
} from "./types";

const BURST_NET_THRESHOLD = 15;

const METRIC_PREFIX = {
  netFollower: "follower.net_trend.",
  newFollows: "follower.new_follows_trend.",
  unfollows: "follower.unfollows_trend.",
  coverCtr: "view.cover_ctr.",
  likes: "engage.likes_trend.",
  saves: "engage.saves_trend.",
  views: "view.views_trend.",
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
    postUrl: n.postUrl,
  };
}

export async function getDashboardSnapshot(
  yearFilter: number | null,
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
    likesMap,
    savesMap,
    viewsMap,
    yearRows,
    topNotes,
  ] = await Promise.all([
      sumByDatePrefix(METRIC_PREFIX.netFollower),
      sumByDatePrefix(METRIC_PREFIX.newFollows),
      sumByDatePrefix(METRIC_PREFIX.unfollows),
      sumByDatePrefix(METRIC_PREFIX.coverCtr),
      sumByDatePrefix(METRIC_PREFIX.likes),
      sumByDatePrefix(METRIC_PREFIX.saves),
      sumByDatePrefix(METRIC_PREFIX.views),
      prisma.$queryRaw<{ y: number }[]>`
        SELECT DISTINCT EXTRACT(YEAR FROM published_date)::int AS y
        FROM notes
        ORDER BY y DESC
      `,
      prisma.note.findMany({
        where:
          yearFilter !== null
            ? {
                publishedDate: {
                  gte: new Date(Date.UTC(yearFilter, 0, 1)),
                  lt: new Date(Date.UTC(yearFilter + 1, 0, 1)),
                },
              }
            : undefined,
        orderBy: [
          { views: { sort: "desc", nulls: "last" } },
          { publishedDate: "desc" },
        ],
        take: 10,
      }),
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
    followerPoints: buildFollowerCurve(
      settings.launchDate,
      settings.followers,
      netByDate,
    ),
    coverCtrTrend: last30DayPoints(coverMap),
    likesAndSavesTrend: last30DayPoints(mergeDailyMaps(likesMap, savesMap)),
    viewsTrend: last30DayPoints(viewsMap),
    years,
    topNotes: topNotes.map(mapTopNoteRow),
  };
}
