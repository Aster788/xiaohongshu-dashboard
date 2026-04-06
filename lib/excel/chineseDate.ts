/**
 * Normalize export datetime strings to a calendar **day** (UTC midnight) for merge keys.
 * Example: `2026年03月16日08时00分29秒` → 2026-03-16 UTC date.
 */

const CHINESE_DAY_RE =
  /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2})\s*时)?(?:\s*(\d{1,2})\s*分)?(?:\s*(\d{1,2})\s*秒)?/;

function utcDateOnly(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d));
}

/** Calendar day in local timezone of `d`, stored as UTC midnight (for file-mtime fallback). */
export function localCalendarDateToUtcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function parseIsoDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse cell/export values to UTC date-only. Returns null if not recognized.
 */
export function parseToUtcDateOnly(input: unknown): Date | null {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return utcDateOnly(
      input.getUTCFullYear(),
      input.getUTCMonth(),
      input.getUTCDate(),
    );
  }
  if (typeof input === "number" && Number.isFinite(input)) {
    // Excel serial date (ExcelJS usually converts to Date; keep as fallback)
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + Math.round(input * 86400000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return utcDateOnly(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  const zh = s.match(CHINESE_DAY_RE);
  if (zh) {
    const y = Number(zh[1]);
    const m = Number(zh[2]);
    const day = Number(zh[3]);
    if (!y || m < 1 || m > 12 || day < 1 || day > 31) return null;
    return utcDateOnly(y, m - 1, day);
  }

  const isoPrefix = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoPrefix)) {
    return parseIsoDateOnly(isoPrefix);
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return utcDateOnly(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  return null;
}
