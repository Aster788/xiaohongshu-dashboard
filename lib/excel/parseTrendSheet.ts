import type ExcelJS from "exceljs";
import { excelCellToPrimitive, primitiveToTrimmedString } from "./cellValue";
import { parseToUtcDateOnly } from "./chineseDate";
import type { ParsedAccountDailyRow } from "./domainTypes";
import { parseMetricScalar, slugMetricSegment } from "./numbers";
import type { TrendSheetKind } from "./sheetConfig";
import { TREND_METRIC_PREFIX } from "./sheetConfig";

const DATE_HEADER_ALIASES = ["日期", "统计日期", "时间", "数据日期"] as const;
const MAX_HEADER_SCAN_ROW = 25;
const METRIC_KEY_MAX = 180;

function rowTexts(row: ExcelJS.Row, maxCol: number): string[] {
  const out: string[] = [];
  for (let c = 1; c <= maxCol; c++) {
    out.push(primitiveToTrimmedString(excelCellToPrimitive(row.getCell(c))));
  }
  return out;
}

function isDateHeader(h: string): boolean {
  const t = h.trim();
  return (DATE_HEADER_ALIASES as readonly string[]).some((a) => t === a || t.endsWith("日期"));
}

function findHeaderRow(worksheet: ExcelJS.Worksheet): { rowIndex: number; texts: string[] } | null {
  const limit = Math.min(worksheet.rowCount || 0, MAX_HEADER_SCAN_ROW);
  for (let r = 1; r <= limit; r++) {
    const row = worksheet.getRow(r);
    const texts = rowTexts(row, row.cellCount);
    if (texts.some((t) => isDateHeader(t))) {
      return { rowIndex: r, texts };
    }
  }
  return null;
}

export function parseTrendSheet(
  worksheet: ExcelJS.Worksheet,
  sheetLabel: string,
  kind: TrendSheetKind,
): { rows: ParsedAccountDailyRow[]; warning?: string } {
  const found = findHeaderRow(worksheet);
  if (!found) {
    return {
      rows: [],
      warning: `Trend sheet "${sheetLabel}": could not find a date header row (期望列名含「日期」等).`,
    };
  }

  const { rowIndex, texts } = found;
  let dateCol = texts.findIndex((t) => isDateHeader(t));
  if (dateCol < 0) dateCol = 0;

  const prefix = TREND_METRIC_PREFIX[kind];
  const metricCols: { colIndex: number; header: string }[] = [];
  for (let c = 0; c < texts.length; c++) {
    if (c === dateCol) continue;
    const h = texts[c]?.trim() ?? "";
    if (!h) continue;
    if (h === "序号") continue;
    metricCols.push({ colIndex: c + 1, header: h });
  }

  if (metricCols.length === 0) {
    return {
      rows: [],
      warning: `Trend sheet "${sheetLabel}": no metric columns next to date column.`,
    };
  }

  const rows: ParsedAccountDailyRow[] = [];
  const dataStart = rowIndex + 1;
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < dataStart) return;
    const dateCell = excelCellToPrimitive(row.getCell(dateCol + 1));
    const day = parseToUtcDateOnly(dateCell);
    if (!day) return;

    for (const { colIndex, header } of metricCols) {
      const v = parseMetricScalar(excelCellToPrimitive(row.getCell(colIndex)));
      if (v === null) continue;
      const slug = slugMetricSegment(header, 80);
      const metricKey = `${prefix}.${slug}`;
      const key =
        metricKey.length > METRIC_KEY_MAX ? metricKey.slice(0, METRIC_KEY_MAX) : metricKey;
      rows.push({ date: day, metricKey: key, value: v });
    }
  });

  return { rows };
}
