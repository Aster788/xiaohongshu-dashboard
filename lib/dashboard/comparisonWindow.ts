import type { PerformanceComparisonWindowDTO } from "./types";

function parseIsoDateUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function toIsoDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function addUtcDays(d: Date, days: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days),
  );
}

/** Rolling 30d vs prior 30d windows aligned to the overview anchor day (UTC calendar dates). */
export function performanceComparisonWindowFromAnchorIso(
  anchorIso: string,
): PerformanceComparisonWindowDTO {
  const currentEnd = parseIsoDateUTC(anchorIso);
  const currentStart = addUtcDays(currentEnd, -29);
  const priorEnd = addUtcDays(currentEnd, -30);
  const priorStart = addUtcDays(currentEnd, -59);
  return {
    currentStartIso: toIsoDateUTC(currentStart),
    currentEndIso: toIsoDateUTC(currentEnd),
    priorStartIso: toIsoDateUTC(priorStart),
    priorEndIso: toIsoDateUTC(priorEnd),
  };
}

/** Best-effort anchor when snapshot omits `performanceComparisonWindow` (e.g. stale cache). */
export function fallbackAnchorIsoFromTrendEnds(
  viewsTrend: { dateIso: string }[],
  likesAndSavesTrend: { dateIso: string }[],
  coverCtrTrend: { dateIso: string }[],
  publishTrend: { dateIso: string }[],
): string | null {
  const ends = [
    viewsTrend.at(-1)?.dateIso,
    likesAndSavesTrend.at(-1)?.dateIso,
    coverCtrTrend.at(-1)?.dateIso,
    publishTrend.at(-1)?.dateIso,
  ].filter((v): v is string => Boolean(v));
  if (ends.length === 0) return null;
  return ends.sort().at(-1)!;
}
