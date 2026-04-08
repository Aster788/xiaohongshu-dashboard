import type { WorkbookParseResult } from "@/lib/excel/workbookTypes";

function readApiError(data: unknown, fallback: string): string {
  return data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
    ? (data as { error: string }).error
    : fallback;
}

function authHeaders(secret: string): HeadersInit {
  const headers: HeadersInit = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

export async function parseWorkbookPreview(
  secret: string,
  file: File,
): Promise<{ ok: true; data: WorkbookParseResult } | { ok: false; status: number; error: string }> {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch("/api/excel/parse", {
    method: "POST",
    body,
    headers: authHeaders(secret),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(data, `Request failed (${res.status})`),
    };
  }
  return { ok: true, data: data as WorkbookParseResult };
}
