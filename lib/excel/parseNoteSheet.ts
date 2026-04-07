import type ExcelJS from "exceljs";
import { excelCellToPrimitive, primitiveToTrimmedString } from "./cellValue";
import { parseToUtcDateOnly } from "./chineseDate";
import type { ParsedNoteRow } from "./domainTypes";
import { parseBigIntish, parseFiniteNumber } from "./numbers";

type NoteField =
  | "title"
  | "publishedDate"
  | "format"
  | "impressions"
  | "views"
  | "likes"
  | "comments"
  | "saves"
  | "shares"
  | "followerGain";

/** Row 1 = export note line, row 2 = headers, row 3+ = data (PRD). */
const HEADER_ROW = 2;
const DATA_START_ROW = 3;

const NOTE_HEADER_ALIASES: Record<NoteField, string[]> = {
  title: ["笔记标题", "标题"],
  publishedDate: ["首次发布时间", "发布时间", "发表时间", "发布日期"],
  format: ["体裁", "笔记类型", "类型", "笔记体裁"],
  impressions: ["曝光量", "曝光", "展现量"],
  views: ["观看量", "浏览量", "阅读量"],
  likes: ["点赞量", "点赞", "点赞数", "获赞"],
  comments: ["评论量", "评论", "评论数"],
  saves: ["收藏量", "收藏", "收藏数"],
  shares: ["分享量", "分享", "分享数", "转发量"],
  followerGain: ["涨粉", "粉丝变化", "新增粉丝"],
};

function buildHeaderMap(headerRow: ExcelJS.Row): Map<NoteField, number> {
  const map = new Map<NoteField, number>();
  const maxCol = headerRow.cellCount;
  for (let c = 1; c <= maxCol; c++) {
    const raw = primitiveToTrimmedString(excelCellToPrimitive(headerRow.getCell(c)));
    if (!raw) continue;
    for (const field of Object.keys(NOTE_HEADER_ALIASES) as NoteField[]) {
      if (map.has(field)) continue;
      const aliases = NOTE_HEADER_ALIASES[field];
      if (aliases.includes(raw)) {
        map.set(field, c);
        break;
      }
    }
  }
  return map;
}

function cell(row: ExcelJS.Row, col: number | undefined) {
  if (col === undefined) return null;
  return excelCellToPrimitive(row.getCell(col));
}

export function parseNoteDetailSheet(
  worksheet: ExcelJS.Worksheet,
  sheetLabel: string,
): { rows: ParsedNoteRow[]; warning?: string } {
  const headerRow = worksheet.getRow(HEADER_ROW);
  const col = buildHeaderMap(headerRow);
  const titleCol = col.get("title");
  const dateCol = col.get("publishedDate");
  if (titleCol === undefined || dateCol === undefined) {
    return {
      rows: [],
      warning: `Note sheet "${sheetLabel}": missing required columns (need 笔记标题/标题 and 发布时间/发布日期).`,
    };
  }

  const rows: ParsedNoteRow[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < DATA_START_ROW) return;
    const title = primitiveToTrimmedString(cell(row, titleCol));
    if (!title) return;
    const published = parseToUtcDateOnly(cell(row, dateCol));
    if (!published) return;

    rows.push({
      title,
      publishedDate: published,
      format: (() => {
        const v = primitiveToTrimmedString(cell(row, col.get("format")));
        return v || null;
      })(),
      impressions: parseBigIntish(cell(row, col.get("impressions"))),
      views: (() => {
        const n = parseFiniteNumber(cell(row, col.get("views")));
        return n === null ? null : Math.trunc(n);
      })(),
      likes: (() => {
        const n = parseFiniteNumber(cell(row, col.get("likes")));
        return n === null ? null : Math.trunc(n);
      })(),
      comments: (() => {
        const n = parseFiniteNumber(cell(row, col.get("comments")));
        return n === null ? null : Math.trunc(n);
      })(),
      saves: (() => {
        const n = parseFiniteNumber(cell(row, col.get("saves")));
        return n === null ? null : Math.trunc(n);
      })(),
      shares: (() => {
        const n = parseFiniteNumber(cell(row, col.get("shares")));
        return n === null ? null : Math.trunc(n);
      })(),
      followerGain: (() => {
        const n = parseFiniteNumber(cell(row, col.get("followerGain")));
        return n === null ? null : Math.trunc(n);
      })(),
    });
  });

  return { rows };
}
