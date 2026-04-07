import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { excelCellToPrimitive } from "./cellValue";
import { buildMergedSummary } from "./workbookMerge";
import type {
  CellValue,
  ParseWorkbookOptions,
  ParsedSheet,
  WorkbookParseResult,
} from "./workbookTypes";

export type {
  CellValue,
  MergedSummary,
  ParsedSheet,
  ParseWorkbookOptions,
  WorkbookParseResult,
} from "./workbookTypes";

const PREVIEW_MAX_ROWS = 25;
const DEFAULT_MAX_ROWS_IN_PAYLOAD = 500;

function worksheetToGrid(worksheet: ExcelJS.Worksheet): CellValue[][] {
  const dim = worksheet.dimensions;
  if (!dim) return [];

  const grid: CellValue[][] = [];
  for (let r = dim.top; r <= dim.bottom; r++) {
    const row = worksheet.getRow(r);
    const rowData: CellValue[] = [];
    for (let c = dim.left; c <= dim.right; c++) {
      rowData.push(excelCellToPrimitive(row.getCell(c)));
    }
    grid.push(rowData);
  }
  return grid;
}

function gridColCount(grid: CellValue[][]): number {
  let max = 0;
  for (const row of grid) {
    if (row.length > max) max = row.length;
  }
  return max;
}

function padRowsToColCount(grid: CellValue[][], colCount: number): CellValue[][] {
  return grid.map((row) => {
    if (row.length >= colCount) return row;
    const next = row.slice();
    while (next.length < colCount) next.push(null);
    return next;
  });
}

/**
 * Parse an `.xlsx` workbook into per-sheet grids and a workbook-level summary.
 * Intended for Node.js runtime only (uses `exceljs`).
 */
export async function parseWorkbookBuffer(
  data: ArrayBuffer,
  options?: ParseWorkbookOptions,
): Promise<WorkbookParseResult> {
  const maxRows =
    options?.maxRowsPerSheetInPayload ?? DEFAULT_MAX_ROWS_IN_PAYLOAD;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(Buffer.from(data)));

  const sheetOrder: string[] = [];
  const sheets: ParsedSheet[] = [];

  workbook.eachSheet((worksheet) => {
    sheetOrder.push(worksheet.name);
    const name = worksheet.name;
    const fullGrid = worksheetToGrid(worksheet);
    const rowCount = fullGrid.length;
    const colCount = gridColCount(fullGrid);
    const padded = padRowsToColCount(fullGrid, colCount);
    const previewGrid = padded.slice(0, PREVIEW_MAX_ROWS);
    const payloadRows = padded.slice(0, maxRows);

    sheets.push({
      name,
      rowCount,
      colCount,
      previewGrid,
      sheetRows: payloadRows,
      payloadRowsTruncated: rowCount > payloadRows.length,
    });
  });

  return {
    sheetOrder,
    sheets,
    mergedSummary: buildMergedSummary(sheets),
  };
}
