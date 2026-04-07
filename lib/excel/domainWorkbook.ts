import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { localCalendarDateToUtcMidnight } from "./chineseDate";
import type { DomainWorkbookResult, ParsedAccountDailyRow, ParsedNoteRow } from "./domainTypes";
import { dedupeDaily, dedupeNotes } from "./domainMerge";
import { parseNoteDetailSheet } from "./parseNoteSheet";
import { parseSnapshotMetricSheet } from "./parseSnapshotMetricSheet";
import { parseTrendSheet } from "./parseTrendSheet";
import { isNoteListWorkbookFileName, routeSheetByName } from "./sheetConfig";

export type IngestXlsxOptions = {
  /** Original upload filename (used to detect 笔记列表明细表.xlsx → `Sheet1`). */
  fileName?: string;
  /** When the workbook has no parsable trend dates, snapshot `指标|数值` sheets use this calendar day (local). */
  referenceDate?: Date;
};

function maxUtcDay(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

/**
 * PRD-aligned domain extract from one `.xlsx` buffer (Node / exceljs only).
 */
export async function ingestDomainFromXlsxBuffer(
  data: ArrayBuffer,
  options?: IngestXlsxOptions,
): Promise<DomainWorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(Buffer.from(data)));

  const notes: ParsedNoteRow[] = [];
  const accountDaily: ParsedAccountDailyRow[] = [];
  const warnings: string[] = [];
  const snapshotJobs: {
    worksheet: ExcelJS.Worksheet;
    name: string;
    metricKeyPrefix: string;
  }[] = [];

  const noteFile = isNoteListWorkbookFileName(options?.fileName);

  workbook.eachSheet((worksheet) => {
    const name = worksheet.name;

    if (noteFile) {
      const { rows, warning } = parseNoteDetailSheet(worksheet, name);
      if (warning) warnings.push(warning);
      notes.push(...rows);
      return;
    }

    const route = routeSheetByName(name);
    if (route.type === "note_detail") {
      const { rows, warning } = parseNoteDetailSheet(worksheet, name);
      if (warning) warnings.push(warning);
      notes.push(...rows);
      return;
    }
    if (route.type === "account_snapshot") {
      snapshotJobs.push({
        worksheet,
        name,
        metricKeyPrefix: route.metricKeyPrefix,
      });
      return;
    }
    if (route.type === "account_daily_trend") {
      const { rows, warning } = parseTrendSheet(worksheet, name, route.kind);
      if (warning) warnings.push(warning);
      accountDaily.push(...rows);
      return;
    }
    warnings.push(
      `Unrecognized sheet "${name}" skipped (add an alias in lib/excel/sheetConfig.ts if it should ingest).`,
    );
  });

  const trendMaxDay = maxUtcDay(accountDaily.map((r) => r.date));
  let snapshotDay = trendMaxDay;
  if (!snapshotDay && options?.referenceDate) {
    snapshotDay = localCalendarDateToUtcMidnight(options.referenceDate);
  }

  for (const job of snapshotJobs) {
    if (!snapshotDay) {
      warnings.push(
        `Snapshot sheet "${job.name}" skipped (no trend dates in workbook; pass file lastModified as referenceDate).`,
      );
      continue;
    }
    const { rows, warning } = parseSnapshotMetricSheet(
      job.worksheet,
      job.name,
      job.metricKeyPrefix,
      snapshotDay,
    );
    if (warning) warnings.push(warning);
    accountDaily.push(...rows);
  }

  return {
    notes: dedupeNotes(notes),
    accountDaily: dedupeDaily(accountDaily),
    warnings,
  };
}

