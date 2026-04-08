import { NextResponse } from "next/server";
import {
  badRequest,
  payloadTooLarge,
  unauthorizedJson,
  unprocessableEntity,
} from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { parseWorkbookBuffer } from "@/lib/excel/parseWorkbook";

/** Preview-only: returns raw per-sheet cell grids for debugging. Persisted ingest uses POST /api/upload. */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return payloadTooLarge("Payload too large");
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return badRequest("Invalid form data");
  }

  if (!isUploadRequestAuthorized(request, formData)) {
    return unauthorizedJson();
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return badRequest("Missing file");
  }

  if (file.size > MAX_BYTES) {
    return payloadTooLarge("File too large");
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return badRequest("Only .xlsx files are accepted (legacy .xls is not supported)");
  }

  const arrayBuffer = await file.arrayBuffer();

  try {
    const parsed = await parseWorkbookBuffer(arrayBuffer);
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to parse workbook";
    return unprocessableEntity(message);
  }
}
