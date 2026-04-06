import { NextResponse } from "next/server";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { parseWorkbookBuffer } from "@/lib/excel/parseWorkbook";

/** Preview-only: returns raw per-sheet cell grids for debugging. Persisted ingest uses POST /api/upload. */
export const runtime = "nodejs";

const MAX_BYTES = 15 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!isUploadRequestAuthorized(request, formData)) {
    return unauthorized();
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx")) {
    return NextResponse.json(
      { error: "Only .xlsx files are accepted (legacy .xls is not supported)" },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  try {
    const parsed = await parseWorkbookBuffer(arrayBuffer);
    return NextResponse.json(parsed);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to parse workbook";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
