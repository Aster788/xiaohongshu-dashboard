import { get } from "@vercel/blob";
import { revalidateTag } from "next/cache";
import { getWritable } from "workflow";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard/queries";
import { combineDomainIngests } from "@/lib/excel/domainMerge";
import type { DomainWorkbookResult } from "@/lib/excel/domainTypes";
import type { KpiFormPatch } from "@/lib/settings/formKpi";
import { mapWithConcurrency } from "@/lib/upload/async";
import {
  buildUploadWorkflowResult,
  type UploadJobSourceSummary,
  type UploadParseError,
  type UploadWorkflowResult,
} from "@/lib/upload/jobStatus";
import type { UploadJobProgress } from "@/lib/upload/progress";
import {
  completedProgress,
  failedProgress,
  finalizingProgress,
  mergingProgress,
  parsingProgress,
  queuedProgress,
} from "@/lib/upload/progress";
import { isTransientUploadError, retryAsync } from "@/lib/upload/retry";
import type { UploadStartPayload } from "@/lib/upload/startPayload";

type ParsedBlobSourceResult =
  | {
      ok: true;
      source: UploadJobSourceSummary;
      part: DomainWorkbookResult;
    }
  | {
      ok: false;
      source: UploadJobSourceSummary;
      message: string;
    };

const PARSE_CONCURRENCY = 2;
const BLOB_FETCH_RETRIES = 2;
const PERSIST_RETRIES = 2;
const CACHE_RETRIES = 2;
const DEFAULT_LAUNCH_DATE = new Date("2025-06-15T00:00:00.000Z");

function inferRunIdFromSourcePath(pathname: string | undefined): string {
  if (!pathname) return "unknown-run";
  const parts = pathname.split("/");
  if (parts.length < 2) return "unknown-run";
  return parts[1] || "unknown-run";
}

function toSourceSummary(source: UploadStartPayload["sources"][number]): UploadJobSourceSummary {
  return {
    fileName: source.fileName,
    pathname: source.pathname,
    size: source.size,
  };
}

function allWorkbooksFailedMessage(errors: UploadParseError[]): string {
  if (errors.length === 0) return "All workbooks failed to parse";
  const [first] = errors;
  return `All workbooks failed to parse: ${first.fileName}: ${first.message}`;
}

async function applyKpiPatch(patch: KpiFormPatch): Promise<boolean> {
  "use step";
  const { prisma } = await import("@/lib/db");
  if (Object.keys(patch).length === 0) {
    return false;
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      followers: patch.followers ?? 0,
      totalPosts: patch.totalPosts ?? 0,
      likesAndSaves: patch.likesAndSaves ?? 0,
      launchDate: patch.launchDate ?? DEFAULT_LAUNCH_DATE,
    },
    update: patch,
  });

  return true;
}

async function refreshDashboardCache() {
  "use step";
  revalidateTag(DASHBOARD_CACHE_TAG);
}

async function mergeCombinedDomainStep(domain: DomainWorkbookResult, runId: string) {
  "use step";
  const { prisma } = await import("@/lib/db");
  const { mergeDomainIntoDb } = await import("@/lib/merge/mergeIngest");
  return mergeDomainIntoDb(prisma, domain, runId);
}

async function writeProgressSnapshot(snapshot: UploadJobProgress) {
  "use step";
  console.info("[uploadBlobSources] progress", snapshot.phase, snapshot.progressPercent);
  const writer = getWritable<UploadJobProgress>({ namespace: "progress" }).getWriter();
  try {
    await writer.write(snapshot);
  } finally {
    writer.releaseLock();
  }
}

async function parseBlobSourceBatch(
  sources: UploadStartPayload["sources"],
): Promise<ParsedBlobSourceResult[]> {
  "use step";
  console.info("[uploadBlobSources] parsing blob batch", sources.length);
  const { ingestDomainFromXlsxBuffer } = await import("@/lib/excel/domainWorkbook");

  return mapWithConcurrency(sources, PARSE_CONCURRENCY, async (source) => {
    const summary = toSourceSummary(source);

    try {
      const data = await retryAsync(
        async () => {
          const blob = await get(source.pathname, {
            access: "private",
            useCache: false,
          });
          if (!blob || blob.statusCode !== 200 || !blob.stream) {
            throw new Error("Blob file not found");
          }

          return new Response(blob.stream).arrayBuffer();
        },
        {
          retries: BLOB_FETCH_RETRIES,
          shouldRetry: isTransientUploadError,
          onRetry: async (error, attempt) => {
            const message = error instanceof Error ? error.message : "Unknown blob read error";
            console.warn(
              `[uploadBlobSources] retrying blob fetch for ${source.fileName} after attempt ${attempt}: ${message}`,
            );
          },
        },
      );
      const part = await ingestDomainFromXlsxBuffer(data, {
        fileName: source.fileName,
        referenceDate: new Date(source.uploadedAt),
      });

      return {
        ok: true,
        source: summary,
        part,
      };
    } catch (error) {
      return {
        ok: false,
        source: summary,
        message: error instanceof Error ? error.message : "Failed to parse workbook",
      };
    }
  });
}

export async function uploadBlobSourcesWorkflow(
  input: UploadStartPayload,
): Promise<UploadWorkflowResult> {
  "use workflow";
  console.info("[uploadBlobSources] started", input.sources.length);
  const runId = inferRunIdFromSourcePath(input.sources[0]?.pathname);

  await writeProgressSnapshot(queuedProgress(input.sources.length));

  let parsedFiles = 0;
  const ingestParts: DomainWorkbookResult[] = [];
  const parseErrors: UploadParseError[] = [];
  const sourceSummaries = input.sources.map(toSourceSummary);

  try {
    for (let i = 0; i < input.sources.length; i += PARSE_CONCURRENCY) {
      const batch = input.sources.slice(i, i + PARSE_CONCURRENCY);
      const batchResults = await parseBlobSourceBatch(batch);

      for (const result of batchResults) {
        parsedFiles += 1;
        if (result.ok) {
          ingestParts.push(result.part);
        } else {
          parseErrors.push({
            fileName: result.source.fileName,
            message: result.message,
          });
        }
      }

      await writeProgressSnapshot(
        parsingProgress({
          totalFiles: input.sources.length,
          parsedFiles,
          currentFileName: batch[batch.length - 1]?.fileName,
        }),
      );
    }

    if (ingestParts.length === 0) {
      throw new Error(allWorkbooksFailedMessage(parseErrors));
    }

    const combined = combineDomainIngests(ingestParts);
    await writeProgressSnapshot(
      mergingProgress({
        totalFiles: input.sources.length,
        parsedFiles,
        noteRows: combined.notes.length,
        accountDailyRows: combined.accountDaily.length,
      }),
    );

    const mergeResult = await retryAsync(() => mergeCombinedDomainStep(combined, runId), {
      retries: PERSIST_RETRIES,
      shouldRetry: isTransientUploadError,
      onRetry: async (error, attempt) => {
        const message = error instanceof Error ? error.message : "Unknown database merge error";
        console.warn(
          `[uploadBlobSources] retrying database merge after attempt ${attempt}: ${message}`,
        );
      },
    });
    const kpiSaved = await retryAsync(() => applyKpiPatch(input.kpiPatch), {
      retries: PERSIST_RETRIES,
      shouldRetry: isTransientUploadError,
      onRetry: async (error, attempt) => {
        const message = error instanceof Error ? error.message : "Unknown KPI save error";
        console.warn(
          `[uploadBlobSources] retrying KPI save after attempt ${attempt}: ${message}`,
        );
      },
    });
    await writeProgressSnapshot(
      finalizingProgress({
        totalFiles: input.sources.length,
        parsedFiles,
      }),
    );
    await retryAsync(() => refreshDashboardCache(), {
      retries: CACHE_RETRIES,
      shouldRetry: isTransientUploadError,
      onRetry: async (error, attempt) => {
        const message = error instanceof Error ? error.message : "Unknown cache refresh error";
        console.warn(
          `[uploadBlobSources] retrying dashboard cache refresh after attempt ${attempt}: ${message}`,
        );
      },
    });

    const result = buildUploadWorkflowResult({
      mergeResult,
      filesProcessed: ingestParts.length,
      filesFailed: parseErrors.length,
      noteRowsInPayload: combined.notes.length,
      accountDailyRowsInPayload: combined.accountDaily.length,
      totalBytes: input.totalBytes,
      warnings: combined.warnings,
      errors: parseErrors,
      kpiSaved,
      sources: sourceSummaries,
    });

    await writeProgressSnapshot(
      completedProgress({ totalFiles: input.sources.length, parsedFiles }),
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload workflow failed";
    await writeProgressSnapshot(
      failedProgress({
        totalFiles: input.sources.length,
        parsedFiles,
        message,
      }),
    );
    throw error;
  }
}
