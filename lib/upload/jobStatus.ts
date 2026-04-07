import type { WorkflowRunStatus } from "@workflow/world";
import type { MergeIngestResult } from "@/lib/merge/mergeStats";
import type { UploadJobProgress } from "./progress";

export type UploadParseError = {
  fileName: string;
  message: string;
};

export type UploadJobSourceSummary = {
  fileName: string;
  pathname: string;
  size: number;
};

export type UploadWorkflowResult = MergeIngestResult & {
  summary: {
    filesProcessed: number;
    filesFailed: number;
    noteRowsInPayload: number;
    accountDailyRowsInPayload: number;
    totalBytes: number;
  };
  warnings: string[];
  errors?: UploadParseError[];
  kpiSaved: boolean;
  sources: UploadJobSourceSummary[];
};

export type UploadJobStatusResponse = {
  jobId: string;
  status: WorkflowRunStatus;
  progress: UploadJobProgress | null;
  result: UploadWorkflowResult | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export function buildUploadWorkflowResult(input: {
  mergeResult: MergeIngestResult;
  filesProcessed: number;
  filesFailed: number;
  noteRowsInPayload: number;
  accountDailyRowsInPayload: number;
  totalBytes: number;
  warnings: string[];
  errors: UploadParseError[];
  kpiSaved: boolean;
  sources: UploadJobSourceSummary[];
}): UploadWorkflowResult {
  return {
    ...input.mergeResult,
    summary: {
      filesProcessed: input.filesProcessed,
      filesFailed: input.filesFailed,
      noteRowsInPayload: input.noteRowsInPayload,
      accountDailyRowsInPayload: input.accountDailyRowsInPayload,
      totalBytes: input.totalBytes,
    },
    warnings: input.warnings,
    ...(input.errors.length > 0 ? { errors: input.errors } : {}),
    kpiSaved: input.kpiSaved,
    sources: input.sources,
  };
}

export function isUploadJobProgress(value: unknown): value is UploadJobProgress {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.phase === "string" &&
    typeof row.progressPercent === "number" &&
    typeof row.label === "string" &&
    typeof row.detail === "string" &&
    typeof row.totalFiles === "number" &&
    typeof row.parsedFiles === "number"
  );
}

export function buildUploadJobStatusResponse(input: {
  jobId: string;
  status: WorkflowRunStatus;
  progress?: UploadJobProgress | null;
  result?: UploadWorkflowResult | null;
  error?: string | null;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}): UploadJobStatusResponse {
  return {
    jobId: input.jobId,
    status: input.status,
    progress: input.progress ?? null,
    result: input.result ?? null,
    error: input.error ?? null,
    createdAt: input.createdAt.toISOString(),
    startedAt: input.startedAt?.toISOString() ?? null,
    completedAt: input.completedAt?.toISOString() ?? null,
  };
}
