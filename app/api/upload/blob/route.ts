import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  badRequest,
  serverError,
  unauthorizedJson,
} from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import {
  isAllowedUploadBlobPath,
  MAX_BYTES_PER_FILE,
} from "@/lib/upload/startPayload";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_XLSX_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
];

export async function POST(request: Request) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return serverError("BLOB_READ_WRITE_TOKEN is not configured");
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return badRequest("Invalid JSON");
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isAllowedUploadBlobPath(pathname)) {
          throw new Error("Only .xlsx uploads under upload-jobs/ are allowed");
        }

        return {
          maximumSizeInBytes: MAX_BYTES_PER_FILE,
          allowedContentTypes: ALLOWED_XLSX_CONTENT_TYPES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 5 * 60 * 1000,
        };
      },
    });

    return NextResponse.json(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob token generation failed";
    return badRequest(message);
  }
}
