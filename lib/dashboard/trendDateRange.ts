import type { TrendPointDTO } from "./types";

/** Inclusive span across the four Content Performance trend series (may differ per series). */
export function computeContentTrendDateRange(
  viewsTrend: TrendPointDTO[],
  likesAndSavesTrend: TrendPointDTO[],
  coverCtrTrend: TrendPointDTO[],
  publishTrend: TrendPointDTO[],
): { startIso: string; endIso: string } | null {
  const series = [viewsTrend, likesAndSavesTrend, coverCtrTrend, publishTrend].filter(
    (s) => s.length > 0,
  );
  if (series.length === 0) return null;
  const startIso = series.map((s) => s[0]!.dateIso).sort()[0]!;
  const endIso = series.map((s) => s[s.length - 1]!.dateIso).sort().at(-1)!;
  return { startIso, endIso };
}
