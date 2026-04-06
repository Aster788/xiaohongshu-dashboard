/**
 * PRD: post links must be http(s) only (reject javascript:, file:, etc.).
 */

export function isValidPostUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  return u.protocol === "http:" || u.protocol === "https:";
}
