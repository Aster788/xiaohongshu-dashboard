export type CellValue = string | number | null;

export type ParsedSheet = {
  name: string;
  rowCount: number;
  colCount: number;
  /** First rows for quick scanning in the UI. */
  previewGrid: CellValue[][];
  /**
   * Row-major cell values up to `maxRowsPerSheetInPayload` (sheet may have more rows).
   * Use `rowCount` for the true row count and `payloadRowsTruncated` for truncation.
   */
  sheetRows: CellValue[][];
  payloadRowsTruncated: boolean;
};

export type MergedSummary = {
  totalSheets: number;
  totalRowsAllSheets: number;
  totalColsMax: number;
  perSheet: { name: string; rowCount: number; colCount: number }[];
  /** Header-like row = first non-empty row per sheet (trimmed strings). */
  inferredHeadersPerSheet: { sheetName: string; headers: string[] }[];
  /** Distinct header labels across sheets with how many sheets use each (first-row match). */
  headerLabelFrequency: Record<string, number>;
};

export type WorkbookParseResult = {
  sheetOrder: string[];
  sheets: ParsedSheet[];
  mergedSummary: MergedSummary;
};

export type ParseWorkbookOptions = {
  /** Limits rows included in `sheetRows` to keep JSON payloads bounded. */
  maxRowsPerSheetInPayload?: number;
};
