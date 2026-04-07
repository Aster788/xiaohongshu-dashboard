export type UploadJobPhase =
  | "queued"
  | "parsing"
  | "merging"
  | "finalizing"
  | "completed"
  | "failed";

export type UploadJobProgress = {
  phase: UploadJobPhase;
  progressPercent: number;
  label: string;
  detail: string;
  totalFiles: number;
  parsedFiles: number;
};

type BaseProgressInput = {
  totalFiles: number;
  parsedFiles: number;
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePositiveInt(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function sanitizeBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, "");
  const sanitized = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  return sanitized || "workbook";
}

export function buildUploadBlobPath(input: {
  runId: string;
  fileIndex: number;
  fileName: string;
}): string {
  const index = String(Math.max(0, input.fileIndex)).padStart(2, "0");
  const safeBase = sanitizeBaseName(input.fileName);
  return `upload-jobs/${input.runId}/${index}-${safeBase}.xlsx`;
}

export function queuedProgress(totalFiles: number): UploadJobProgress {
  const files = normalizePositiveInt(totalFiles);
  return {
    phase: "queued",
    progressPercent: 5,
    label: "Queued",
    detail: `Waiting to start ${files} workbook(s).`,
    totalFiles: files,
    parsedFiles: 0,
  };
}

export function parsingProgress(input: {
  totalFiles: number;
  parsedFiles: number;
  currentFileName?: string;
}): UploadJobProgress {
  const totalFiles = Math.max(1, normalizePositiveInt(input.totalFiles));
  const parsedFiles = Math.max(0, Math.min(totalFiles, normalizePositiveInt(input.parsedFiles)));
  const progressPercent = clampPercent(10 + (parsedFiles / totalFiles) * 70);
  const fileHint = input.currentFileName ? ` Current file: ${input.currentFileName}.` : "";

  return {
    phase: "parsing",
    progressPercent,
    label: "Parsing workbooks",
    detail: `Parsed ${parsedFiles}/${totalFiles} workbook(s).${fileHint}`,
    totalFiles,
    parsedFiles,
  };
}

export function mergingProgress(
  input: BaseProgressInput & { noteRows: number; accountDailyRows: number },
): UploadJobProgress {
  const totalFiles = normalizePositiveInt(input.totalFiles);
  const parsedFiles = Math.min(totalFiles, normalizePositiveInt(input.parsedFiles));
  return {
    phase: "merging",
    progressPercent: 82,
    label: "Writing to database",
    detail: `Persisting ${normalizePositiveInt(input.noteRows)} notes and ${normalizePositiveInt(input.accountDailyRows)} daily rows.`,
    totalFiles,
    parsedFiles,
  };
}

export function finalizingProgress(input: BaseProgressInput): UploadJobProgress {
  const totalFiles = normalizePositiveInt(input.totalFiles);
  const parsedFiles = Math.min(totalFiles, normalizePositiveInt(input.parsedFiles));
  return {
    phase: "finalizing",
    progressPercent: 94,
    label: "Refreshing dashboard",
    detail: "Updating cached dashboard data.",
    totalFiles,
    parsedFiles,
  };
}

export function completedProgress(input: BaseProgressInput): UploadJobProgress {
  const totalFiles = normalizePositiveInt(input.totalFiles);
  const parsedFiles = Math.min(totalFiles, normalizePositiveInt(input.parsedFiles));
  return {
    phase: "completed",
    progressPercent: 100,
    label: "Completed",
    detail: "Upload finished successfully.",
    totalFiles,
    parsedFiles,
  };
}

export function failedProgress(
  input: BaseProgressInput & { message: string },
): UploadJobProgress {
  const totalFiles = Math.max(1, normalizePositiveInt(input.totalFiles));
  const parsedFiles = Math.max(0, Math.min(totalFiles, normalizePositiveInt(input.parsedFiles)));
  return {
    phase: "failed",
    progressPercent: clampPercent(19 + (parsedFiles / totalFiles) * 70),
    label: "Failed",
    detail: input.message,
    totalFiles,
    parsedFiles,
  };
}
