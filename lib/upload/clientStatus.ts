import type { WorkflowRunStatus } from "@workflow/world";
import { isUploadJobProgress, type UploadJobSourceSummary } from "./jobStatus";

type TableMergeStats = {
  inserted: number;
  updated: number;
  untouched: number;
};

export type UploadMergeSnapshot = {
  inserted: number;
  updated: number;
  untouched: number;
  notes?: TableMergeStats;
  accountDaily?: TableMergeStats;
  summary?: {
    filesProcessed: number;
    filesFailed: number;
    noteRowsInPayload: number;
    accountDailyRowsInPayload: number;
    totalBytes?: number;
  };
  warnings?: string[];
  errors?: { fileName: string; message: string }[];
  kpiSaved?: boolean;
  sources?: UploadJobSourceSummary[];
};

export type ClientUploadJobStatusResponse = {
  jobId: string;
  status: WorkflowRunStatus;
  progress: ReturnType<typeof parseProgressValue>;
  result: UploadMergeSnapshot | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

const WORKFLOW_RUN_STATUSES = new Set<WorkflowRunStatus>([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isIsoString(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isIsoStringOrNull(value: unknown): value is string | null {
  return value === null || isIsoString(value);
}

function isTableMergeStats(value: unknown): value is TableMergeStats {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.inserted === "number" &&
    typeof value.updated === "number" &&
    typeof value.untouched === "number"
  );
}

function isUploadSourceSummary(value: unknown): value is UploadJobSourceSummary {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.fileName === "string" &&
    typeof value.pathname === "string" &&
    typeof value.size === "number"
  );
}

function parseProgressValue(value: unknown) {
  return isUploadJobProgress(value) ? value : null;
}

export function parseUploadMergeSnapshot(data: unknown): UploadMergeSnapshot | null {
  if (!isPlainObject(data)) return null;
  if (
    typeof data.inserted !== "number" ||
    typeof data.updated !== "number" ||
    typeof data.untouched !== "number"
  ) {
    return null;
  }

  const out: UploadMergeSnapshot = {
    inserted: data.inserted,
    updated: data.updated,
    untouched: data.untouched,
  };

  if ("notes" in data && isTableMergeStats(data.notes)) out.notes = data.notes;
  if ("accountDaily" in data && isTableMergeStats(data.accountDaily)) {
    out.accountDaily = data.accountDaily;
  }

  if (isPlainObject(data.summary)) {
    const summary = data.summary;
    if (
      typeof summary.filesProcessed === "number" &&
      typeof summary.filesFailed === "number" &&
      typeof summary.noteRowsInPayload === "number" &&
      typeof summary.accountDailyRowsInPayload === "number"
    ) {
      out.summary = {
        filesProcessed: summary.filesProcessed,
        filesFailed: summary.filesFailed,
        noteRowsInPayload: summary.noteRowsInPayload,
        accountDailyRowsInPayload: summary.accountDailyRowsInPayload,
        ...(typeof summary.totalBytes === "number" ? { totalBytes: summary.totalBytes } : {}),
      };
    }
  }

  if (Array.isArray(data.warnings) && data.warnings.every((w) => typeof w === "string")) {
    out.warnings = data.warnings;
  }

  if (Array.isArray(data.errors)) {
    const errors = data.errors.flatMap((value) => {
      if (!isPlainObject(value)) return [];
      if (typeof value.fileName !== "string" || typeof value.message !== "string") {
        return [];
      }
      return [{ fileName: value.fileName, message: value.message }];
    });
    if (errors.length !== data.errors.length) return null;
    if (errors.length > 0) out.errors = errors;
  }

  if ("kpiSaved" in data) {
    if (typeof data.kpiSaved !== "boolean") return null;
    out.kpiSaved = data.kpiSaved;
  }

  if ("sources" in data) {
    if (!Array.isArray(data.sources) || !data.sources.every(isUploadSourceSummary)) return null;
    out.sources = data.sources;
  }

  return out;
}

export function parseUploadJobStatusResponse(
  data: unknown,
): ClientUploadJobStatusResponse | null {
  if (!isPlainObject(data)) return null;
  if (
    typeof data.jobId !== "string" ||
    !WORKFLOW_RUN_STATUSES.has(data.status as WorkflowRunStatus) ||
    !("progress" in data) ||
    !("result" in data) ||
    !isIsoString(data.createdAt) ||
    !isIsoStringOrNull(data.startedAt) ||
    !isIsoStringOrNull(data.completedAt)
  ) {
    return null;
  }

  const progress = parseProgressValue(data.progress);
  if (data.progress !== null && progress === null) {
    return null;
  }

  const result = data.result === null ? null : parseUploadMergeSnapshot(data.result);
  if (data.result !== null && result === null) {
    return null;
  }

  if (data.error !== null && typeof data.error !== "string") {
    return null;
  }

  return {
    jobId: data.jobId,
    status: data.status as WorkflowRunStatus,
    progress,
    result,
    error: data.error,
    createdAt: data.createdAt,
    startedAt: data.startedAt,
    completedAt: data.completedAt,
  };
}

export function shouldPollUploadJob(status: WorkflowRunStatus): boolean {
  return status === "pending" || status === "running";
}
