import type ExcelJS from "exceljs";
import type { CellValue } from "./workbookTypes";

function normalizeStandalone(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value);
}

/** Shared ExcelJS cell → JSON-safe primitive (used by grid parse + domain ingest). */
export function excelCellToPrimitive(cell: ExcelJS.Cell): CellValue {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;

  if (typeof v === "object") {
    if ("richText" in v && Array.isArray((v as ExcelJS.CellRichTextValue).richText)) {
      return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join("");
    }
    if ("formula" in v) {
      return normalizeStandalone((v as ExcelJS.CellFormulaValue).result);
    }
    if ("sharedFormula" in v) {
      return normalizeStandalone((v as ExcelJS.CellSharedFormulaValue).result);
    }
    if ("text" in v && typeof (v as { text: string }).text === "string") {
      return (v as { text: string }).text;
    }
    if ("hyperlink" in v) {
      const h = v as ExcelJS.CellHyperlinkValue;
      return h.text ?? h.hyperlink ?? String(v);
    }
  }

  return String(v);
}

export function primitiveToTrimmedString(v: CellValue): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}
