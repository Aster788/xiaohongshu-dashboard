import type { CellValue, MergedSummary, ParsedSheet, WorkbookParseResult } from "./workbookTypes";

function firstNonEmptyRowHeaders(grid: CellValue[][]): string[] {
  for (const row of grid) {
    const texts = row.map((c) =>
      c === null || c === undefined ? "" : String(c).trim(),
    );
    if (texts.some((t) => t.length > 0)) {
      return texts;
    }
  }
  return [];
}

export function buildMergedSummary(sheets: ParsedSheet[]): MergedSummary {
  const perSheet = sheets.map((s) => ({
    name: s.name,
    rowCount: s.rowCount,
    colCount: s.colCount,
  }));
  const totalRowsAllSheets = sheets.reduce((acc, s) => acc + s.rowCount, 0);
  const totalColsMax = sheets.reduce((acc, s) => Math.max(acc, s.colCount), 0);

  const inferredHeadersPerSheet = sheets.map((s) => ({
    sheetName: s.name,
    headers: firstNonEmptyRowHeaders(s.sheetRows),
  }));

  const headerLabelFrequency: Record<string, number> = {};
  for (const { headers } of inferredHeadersPerSheet) {
    const seen = new Set<string>();
    for (const h of headers) {
      const key = h.trim();
      if (!key) continue;
      seen.add(key);
    }
    for (const label of seen) {
      headerLabelFrequency[label] = (headerLabelFrequency[label] ?? 0) + 1;
    }
  }

  return {
    totalSheets: sheets.length,
    totalRowsAllSheets,
    totalColsMax,
    perSheet,
    inferredHeadersPerSheet,
    headerLabelFrequency,
  };
}

function baseFileLabel(fileName: string): string {
  const parts = fileName.split(/[/\\]/);
  return parts[parts.length - 1] || fileName;
}

/**
 * Combine several per-file parse results into one view model.
 * When more than one file is present, sheet names become `filename.xlsx :: SheetName`
 * so tabs from different workbooks do not collide.
 */
export function mergeWorkbookParseResults(
  items: { fileName: string; result: WorkbookParseResult }[],
): WorkbookParseResult {
  if (items.length === 0) {
    return {
      sheetOrder: [],
      sheets: [],
      mergedSummary: buildMergedSummary([]),
    };
  }
  if (items.length === 1) {
    return items[0].result;
  }

  const sheetOrder: string[] = [];
  const sheets: ParsedSheet[] = [];

  for (const { fileName, result } of items) {
    const label = baseFileLabel(fileName);
    for (const sheet of result.sheets) {
      const name = `${label} :: ${sheet.name}`;
      sheetOrder.push(name);
      sheets.push({
        ...sheet,
        name,
      });
    }
  }

  return {
    sheetOrder,
    sheets,
    mergedSummary: buildMergedSummary(sheets),
  };
}
