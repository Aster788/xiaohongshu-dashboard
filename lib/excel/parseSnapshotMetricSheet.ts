import type ExcelJS from "exceljs";
import { excelCellToPrimitive, primitiveToTrimmedString } from "./cellValue";
import type { ParsedAccountDailyRow } from "./domainTypes";
import { parseMetricScalar, slugMetricSegment } from "./numbers";

const METRIC_KEY_MAX = 180;

/**
 * 账号总体* sheets: row1 `指标` | `数值`, metrics from row2 (fixture `caser-xiaohongshu-data`).
 * One `AccountDaily` row per metric; `date` = latest trend day in the same workbook (or file reference day).
 */
export function parseSnapshotMetricSheet(
  worksheet: ExcelJS.Worksheet,
  sheetLabel: string,
  metricKeyPrefix: string,
  snapshotDateUtc: Date,
): { rows: ParsedAccountDailyRow[]; warning?: string } {
  const r1 = worksheet.getRow(1);
  const h1 = primitiveToTrimmedString(excelCellToPrimitive(r1.getCell(1)));
  const h2 = primitiveToTrimmedString(excelCellToPrimitive(r1.getCell(2)));
  if (h1 !== "指标" || h2 !== "数值") {
    return {
      rows: [],
      warning: `Snapshot sheet "${sheetLabel}": expected row1 headers 指标 | 数值.`,
    };
  }

  const rows: ParsedAccountDailyRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 2) return;
    const metricName = primitiveToTrimmedString(excelCellToPrimitive(row.getCell(1)));
    if (!metricName) return;
    const val = parseMetricScalar(excelCellToPrimitive(row.getCell(2)));
    if (val === null) return;
    const slug = slugMetricSegment(metricName, 80);
    const metricKey = `${metricKeyPrefix}.${slug}`;
    const key =
      metricKey.length > METRIC_KEY_MAX ? metricKey.slice(0, METRIC_KEY_MAX) : metricKey;
    rows.push({ date: snapshotDateUtc, metricKey: key, value: val });
  });

  return { rows };
}
