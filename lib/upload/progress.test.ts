import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUploadBlobPath,
  completedProgress,
  failedProgress,
  finalizingProgress,
  mergingProgress,
  parsingProgress,
  queuedProgress,
} from "./progress";

test("buildUploadBlobPath keeps xlsx extension and normalizes unsafe characters", () => {
  const out = buildUploadBlobPath({
    runId: "run_123",
    fileIndex: 2,
    fileName: "小红书 账号总览 2026/04/06.xlsx",
  });

  assert.equal(out, "upload-jobs/run_123/02-2026-04-06.xlsx");
});

test("parsingProgress advances based on parsed files", () => {
  const progress = parsingProgress({
    totalFiles: 5,
    parsedFiles: 2,
    currentFileName: "views.xlsx",
  });

  assert.equal(progress.phase, "parsing");
  assert.equal(progress.progressPercent, 38);
  assert.equal(progress.label, "Parsing workbooks");
  assert.match(progress.detail, /2\/5/);
  assert.match(progress.detail, /views\.xlsx/);
});

test("phase helpers expose stable user-facing progress snapshots", () => {
  assert.deepEqual(queuedProgress(5), {
    phase: "queued",
    progressPercent: 5,
    label: "Queued",
    detail: "Waiting to start 5 workbook(s).",
    totalFiles: 5,
    parsedFiles: 0,
  });

  assert.deepEqual(
    mergingProgress({
      totalFiles: 5,
      parsedFiles: 5,
      noteRows: 120,
      accountDailyRows: 340,
    }),
    {
      phase: "merging",
      progressPercent: 82,
      label: "Writing to database",
      detail: "Persisting 120 notes and 340 daily rows.",
      totalFiles: 5,
      parsedFiles: 5,
    },
  );

  assert.deepEqual(finalizingProgress({ totalFiles: 5, parsedFiles: 5 }), {
    phase: "finalizing",
    progressPercent: 94,
    label: "Refreshing dashboard",
    detail: "Updating cached dashboard data.",
    totalFiles: 5,
    parsedFiles: 5,
  });

  assert.deepEqual(completedProgress({ totalFiles: 5, parsedFiles: 5 }), {
    phase: "completed",
    progressPercent: 100,
    label: "Completed",
    detail: "Upload finished successfully.",
    totalFiles: 5,
    parsedFiles: 5,
  });

  assert.deepEqual(
    failedProgress({
      totalFiles: 5,
      parsedFiles: 3,
      message: "Blob download failed",
    }),
    {
      phase: "failed",
      progressPercent: 61,
      label: "Failed",
      detail: "Blob download failed",
      totalFiles: 5,
      parsedFiles: 3,
    },
  );
});
