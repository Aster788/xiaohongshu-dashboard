import { NextResponse } from "next/server";
import { start } from "workflow/api";
import {
  badRequest,
  unauthorizedJson,
  unsupportedMediaType,
} from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { parseUploadStartPayload } from "@/lib/upload/startPayload";
import { uploadBlobSourcesWorkflow } from "@/workflows/uploadBlobSources";

export const runtime = "nodejs";
export const maxDuration = 30;

function statusForUploadPayloadError(message: string): number {
  return /too large/i.test(message) ? 413 : 400;
}

export async function POST(request: Request) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return unsupportedMediaType("Use the Blob upload kickoff JSON payload");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const parsed = parseUploadStartPayload(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.message },
      { status: statusForUploadPayloadError(parsed.message) },
    );
  }

  const run = await start(uploadBlobSourcesWorkflow, [parsed.payload]);

  return NextResponse.json({
    jobId: run.runId,
    status: "queued",
    filesQueued: parsed.payload.sources.length,
    totalBytes: parsed.payload.totalBytes,
    kpiSaved: false,
    sources: parsed.payload.sources.map((source) => ({
      fileName: source.fileName,
      pathname: source.pathname,
      size: source.size,
    })),
  });
}
