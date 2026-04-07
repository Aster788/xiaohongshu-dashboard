import type { CellValue } from "./workbookTypes";
import { primitiveToTrimmedString } from "./cellValue";

export function parseFiniteNumber(v: CellValue): number | null {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = primitiveToTrimmedString(v).replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Trend/snapshot cells: plain numbers, `19%`, `24秒`, etc. */
export function parseMetricScalar(v: CellValue): number | null {
  const direct = parseFiniteNumber(v);
  if (direct !== null) return direct;
  const s = primitiveToTrimmedString(v).replace(/,/g, "");
  if (s === "" || s === "-") return null;
  const pct = /^([\d.]+)\s*%$/.exec(s);
  if (pct) {
    const n = Number(pct[1]);
    return Number.isFinite(n) ? n : null;
  }
  const sec = /^([\d.]+)\s*秒$/.exec(s);
  if (sec) {
    const n = Number(sec[1]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseBigIntish(v: CellValue): bigint | null {
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) {
    return BigInt(Math.trunc(v));
  }
  const s = primitiveToTrimmedString(v).replace(/,/g, "");
  if (s === "" || s === "-") return null;
  try {
    return BigInt(s.split(".")[0] ?? s);
  } catch {
    return null;
  }
}

export function slugMetricSegment(label: string, maxLen: number): string {
  const t = label.trim().replace(/\s+/g, "_");
  const ascii = t
    .replace(/[^\w\u4e00-\u9fff]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const base = ascii || "col";
  return base.length > maxLen ? base.slice(0, maxLen) : base;
}
