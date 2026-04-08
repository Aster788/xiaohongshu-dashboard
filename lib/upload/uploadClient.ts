import {
  parseUploadJobStatusResponse,
  type ClientUploadJobStatusResponse,
} from "./clientStatus";

export type QueuedUploadJob = {
  jobId: string;
  status: "queued";
  filesQueued: number;
  totalBytes: number;
  kpiSaved: boolean;
  sources: Array<{
    fileName: string;
    pathname: string;
    size: number;
  }>;
};

export type UploadSourcePayload = {
  fileName: string;
  pathname: string;
  url: string;
  downloadUrl: string;
  size: number;
  contentType?: string | null;
  uploadedAt: string;
};

export type UploadKickoffPayload = {
  sources: UploadSourcePayload[];
  kpiPatch?: {
    followers: string;
    totalPosts: string;
    likesAndSaves: string;
    launchDate: string;
  };
};

export type UploadKickoffResult =
  | { ok: true; data: QueuedUploadJob }
  | { ok: false; status: number; error: string };

export type UploadStatusResult =
  | { ok: true; data: ClientUploadJobStatusResponse }
  | { ok: false; status: number; error: string };

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

function parseQueuedUploadJob(data: unknown): QueuedUploadJob | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (
    typeof o.jobId !== "string" ||
    o.status !== "queued" ||
    typeof o.filesQueued !== "number" ||
    typeof o.totalBytes !== "number" ||
    typeof o.kpiSaved !== "boolean" ||
    !Array.isArray(o.sources)
  ) {
    return null;
  }

  const sources = o.sources.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.fileName !== "string" ||
      typeof row.pathname !== "string" ||
      typeof row.size !== "number"
    ) {
      return [];
    }
    return [{ fileName: row.fileName, pathname: row.pathname, size: row.size }];
  });
  if (sources.length !== o.sources.length) return null;

  return {
    jobId: o.jobId,
    status: "queued",
    filesQueued: o.filesQueued,
    totalBytes: o.totalBytes,
    kpiSaved: o.kpiSaved,
    sources,
  };
}

export async function kickoffUpload(
  secret: string,
  payload: UploadKickoffPayload,
): Promise<UploadKickoffResult> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { ...authHeaders(secret), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(data, `Upload failed (${res.status})`),
    };
  }
  const queued = parseQueuedUploadJob(data);
  if (!queued) {
    return { ok: false, status: 500, error: "Unexpected upload response." };
  }
  return { ok: true, data: queued };
}

export async function fetchUploadStatus(
  secret: string,
  jobId: string,
): Promise<UploadStatusResult> {
  const res = await fetch(`/api/upload/${jobId}`, {
    headers: authHeaders(secret),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(data, `Status check failed (${res.status})`),
    };
  }
  const parsed = parseUploadJobStatusResponse(data);
  if (!parsed) {
    return { ok: false, status: 500, error: "Unexpected upload job status response." };
  }
  return { ok: true, data: parsed };
}
