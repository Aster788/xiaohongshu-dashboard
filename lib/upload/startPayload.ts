import { parseIsoDateOnly } from "@/lib/excel/chineseDate";
import type { KpiFormPatch } from "@/lib/settings/formKpi";
import { parseNonNegativeInt } from "@/lib/validation/number";

export const MAX_FILES = 12;
export const MAX_BYTES_PER_FILE = 20 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
export const UPLOAD_BLOB_PREFIX = "upload-jobs/";

export type UploadedBlobSource = {
  fileName: string;
  pathname: string;
  url: string;
  downloadUrl: string;
  size: number;
  contentType?: string | null;
  uploadedAt: string;
};

export type UploadStartPayload = {
  sources: UploadedBlobSource[];
  kpiPatch: KpiFormPatch;
  totalBytes: number;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAllowedUploadBlobPath(pathname: string): boolean {
  const normalized = pathname.trim().toLowerCase();
  return normalized.startsWith(UPLOAD_BLOB_PREFIX) && normalized.endsWith(".xlsx");
}

function parseUploadedBlobSource(
  value: unknown,
): { ok: true; source: UploadedBlobSource } | { ok: false; message: string } {
  if (!isPlainObject(value)) {
    return { ok: false, message: "Invalid blob source" };
  }

  const fileName = value.fileName;
  const pathname = value.pathname;
  const url = value.url;
  const downloadUrl = value.downloadUrl;
  const size = value.size;
  const uploadedAt = value.uploadedAt;
  const contentType = value.contentType;

  if (
    !isNonEmptyString(fileName) ||
    !isNonEmptyString(pathname) ||
    !isNonEmptyString(url) ||
    !isNonEmptyString(downloadUrl) ||
    !isNonEmptyString(uploadedAt)
  ) {
    return { ok: false, message: "Invalid blob source" };
  }
  if (!fileName.toLowerCase().endsWith(".xlsx") || !isAllowedUploadBlobPath(pathname)) {
    return { ok: false, message: `Only .xlsx supported: rejected ${fileName}` };
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return { ok: false, message: `Invalid file size: ${fileName}` };
  }
  if (size > MAX_BYTES_PER_FILE) {
    return {
      ok: false,
      message: `File too large: ${fileName} (max ${MAX_BYTES_PER_FILE} bytes per file)`,
    };
  }
  if (Number.isNaN(Date.parse(uploadedAt))) {
    return { ok: false, message: `Invalid uploadedAt: ${fileName}` };
  }

  return {
    ok: true,
    source: {
      fileName,
      pathname,
      url,
      downloadUrl,
      size,
      contentType: typeof contentType === "string" ? contentType : null,
      uploadedAt,
    },
  };
}

function parseOptionalKpiJsonPatch(value: unknown):
  | { ok: true; patch: KpiFormPatch }
  | { ok: false; message: string } {
  if (value == null) return { ok: true, patch: {} };
  if (!isPlainObject(value)) {
    return { ok: false, message: "Invalid kpiPatch" };
  }

  const patch: KpiFormPatch = {};

  if ("followers" in value) {
    const followers = parseNonNegativeInt(value.followers);
    if (followers === null) return { ok: false, message: "Invalid followers" };
    patch.followers = followers;
  }
  if ("totalPosts" in value) {
    const totalPosts = parseNonNegativeInt(value.totalPosts);
    if (totalPosts === null) return { ok: false, message: "Invalid totalPosts" };
    patch.totalPosts = totalPosts;
  }
  if ("likesAndSaves" in value) {
    const likesAndSaves = parseNonNegativeInt(value.likesAndSaves);
    if (likesAndSaves === null) return { ok: false, message: "Invalid likesAndSaves" };
    patch.likesAndSaves = likesAndSaves;
  }
  if ("launchDate" in value) {
    if (!isNonEmptyString(value.launchDate)) {
      return { ok: false, message: "Invalid launchDate" };
    }
    const launchDate = parseIsoDateOnly(value.launchDate.trim().slice(0, 10));
    if (!launchDate) return { ok: false, message: "Invalid launchDate" };
    patch.launchDate = launchDate;
  }

  return { ok: true, patch };
}

export function parseUploadStartPayload(
  body: unknown,
): { ok: true; payload: UploadStartPayload } | { ok: false; message: string } {
  if (!isPlainObject(body)) {
    return { ok: false, message: "Expected object body" };
  }

  const rawSources = body.sources;
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    return { ok: false, message: "No files uploaded to Blob" };
  }
  if (rawSources.length > MAX_FILES) {
    return { ok: false, message: `Too many files (max ${MAX_FILES})` };
  }

  const parsedSources: UploadedBlobSource[] = [];
  let totalBytes = 0;
  for (const rawSource of rawSources) {
    const parsed = parseUploadedBlobSource(rawSource);
    if (!parsed.ok) return parsed;
    totalBytes += parsed.source.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return { ok: false, message: "Total upload size too large" };
    }
    parsedSources.push(parsed.source);
  }

  const kpiParsed = parseOptionalKpiJsonPatch(body.kpiPatch);
  if (!kpiParsed.ok) return kpiParsed;

  return {
    ok: true,
    payload: {
      sources: parsedSources,
      kpiPatch: kpiParsed.patch,
      totalBytes,
    },
  };
}
