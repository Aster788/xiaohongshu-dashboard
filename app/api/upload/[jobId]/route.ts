import { NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { notFound, unauthorizedJson } from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import {
  buildUploadJobStatusResponse,
  isUploadJobProgress,
  type UploadWorkflowResult,
} from "@/lib/upload/jobStatus";

export const runtime = "nodejs";
export const maxDuration = 30;

async function readLatestProgress(jobId: string) {
  const probe = getRun(jobId).getReadable({ namespace: "progress" });
  const tailIndex = await probe.getTailIndex();
  if (tailIndex < 0) {
    return null;
  }

  const reader = getRun(jobId)
    .getReadable<unknown>({ namespace: "progress", startIndex: tailIndex })
    .getReader();

  try {
    const { value, done } = await reader.read();
    if (done || !isUploadJobProgress(value)) {
      return null;
    }
    return value;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  const { jobId } = await context.params;

  try {
    const run = getRun<UploadWorkflowResult>(jobId);
    if (!(await run.exists)) {
      return notFound("Upload job not found");
    }

    const [status, progress, createdAt, startedAt, completedAt] = await Promise.all([
      run.status,
      readLatestProgress(jobId),
      run.createdAt,
      run.startedAt,
      run.completedAt,
    ]);

    const result = status === "completed" ? await run.returnValue : null;
    const error =
      status === "failed"
        ? progress?.phase === "failed"
          ? progress.detail
          : "Upload workflow failed"
        : status === "cancelled"
          ? "Upload workflow was cancelled"
          : null;

    return NextResponse.json(
      buildUploadJobStatusResponse({
        jobId,
        status,
        progress,
        result,
        error,
        createdAt,
        startedAt: startedAt ?? undefined,
        completedAt: completedAt ?? undefined,
      }),
    );
  } catch {
    return notFound("Upload job not found");
  }
}
