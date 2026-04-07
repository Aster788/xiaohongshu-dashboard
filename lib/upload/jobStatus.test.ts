import assert from "node:assert/strict";
import test from "node:test";
import { completedProgress, failedProgress, parsingProgress } from "./progress";
import {
  buildUploadJobStatusResponse,
  buildUploadWorkflowResult,
} from "./jobStatus";

test("buildUploadWorkflowResult summarizes merge output for completed jobs", () => {
  const result = buildUploadWorkflowResult({
    mergeResult: {
      inserted: 12,
      updated: 8,
      untouched: 90,
      notes: { inserted: 3, updated: 2, untouched: 20 },
      accountDaily: { inserted: 9, updated: 6, untouched: 70 },
    },
    filesProcessed: 4,
    filesFailed: 1,
    noteRowsInPayload: 15,
    accountDailyRowsInPayload: 88,
    totalBytes: 123_456,
    warnings: ["Duplicate note merged"],
    errors: [{ fileName: "bad.xlsx", message: "Sheet missing" }],
    kpiSaved: true,
    sources: [
      { fileName: "a.xlsx", pathname: "upload-jobs/run/a.xlsx", size: 1000 },
      { fileName: "b.xlsx", pathname: "upload-jobs/run/b.xlsx", size: 2000 },
    ],
  });

  assert.equal(result.inserted, 12);
  assert.equal(result.updated, 8);
  assert.equal(result.summary.filesProcessed, 4);
  assert.equal(result.summary.filesFailed, 1);
  assert.equal(result.summary.totalBytes, 123_456);
  assert.equal(result.kpiSaved, true);
  assert.deepEqual(result.warnings, ["Duplicate note merged"]);
  assert.deepEqual(result.errors, [{ fileName: "bad.xlsx", message: "Sheet missing" }]);
});

test("buildUploadJobStatusResponse exposes progress while a job is running", () => {
  const progress = parsingProgress({
    totalFiles: 5,
    parsedFiles: 2,
    currentFileName: "views.xlsx",
  });

  const response = buildUploadJobStatusResponse({
    jobId: "run_123",
    status: "running",
    progress,
    createdAt: new Date("2026-04-07T12:00:00.000Z"),
    startedAt: new Date("2026-04-07T12:00:05.000Z"),
    completedAt: undefined,
  });

  assert.deepEqual(response, {
    jobId: "run_123",
    status: "running",
    progress,
    result: null,
    error: null,
    createdAt: "2026-04-07T12:00:00.000Z",
    startedAt: "2026-04-07T12:00:05.000Z",
    completedAt: null,
  });
});

test("buildUploadJobStatusResponse includes final result and surfaces failure details", () => {
  const completedResult = buildUploadWorkflowResult({
    mergeResult: {
      inserted: 5,
      updated: 4,
      untouched: 30,
      notes: { inserted: 1, updated: 1, untouched: 10 },
      accountDaily: { inserted: 4, updated: 3, untouched: 20 },
    },
    filesProcessed: 5,
    filesFailed: 0,
    noteRowsInPayload: 5,
    accountDailyRowsInPayload: 40,
    totalBytes: 99,
    warnings: [],
    errors: [],
    kpiSaved: false,
    sources: [],
  });

  const completed = buildUploadJobStatusResponse({
    jobId: "run_done",
    status: "completed",
    progress: completedProgress({ totalFiles: 5, parsedFiles: 5 }),
    result: completedResult,
    createdAt: new Date("2026-04-07T12:00:00.000Z"),
    startedAt: new Date("2026-04-07T12:00:05.000Z"),
    completedAt: new Date("2026-04-07T12:01:00.000Z"),
  });
  assert.equal(completed.result?.summary.filesProcessed, 5);
  assert.equal(completed.error, null);

  const failed = buildUploadJobStatusResponse({
    jobId: "run_fail",
    status: "failed",
    progress: failedProgress({
      totalFiles: 5,
      parsedFiles: 3,
      message: "All workbooks failed to parse",
    }),
    error: "All workbooks failed to parse",
    createdAt: new Date("2026-04-07T12:00:00.000Z"),
    startedAt: new Date("2026-04-07T12:00:05.000Z"),
    completedAt: new Date("2026-04-07T12:00:30.000Z"),
  });
  assert.equal(failed.result, null);
  assert.equal(failed.error, "All workbooks failed to parse");
  assert.equal(failed.progress?.phase, "failed");
});
