import assert from "node:assert/strict";
import test from "node:test";

test("client upload status helpers parse running and completed job responses", async () => {
  const mod = await import("./clientStatus").catch(() => null);

  assert.ok(mod, "clientStatus helpers should exist");
  if (!mod) return;

  const { parseUploadJobStatusResponse, shouldPollUploadJob } = mod;

  const running = parseUploadJobStatusResponse({
    jobId: "run_123",
    status: "running",
    progress: {
      phase: "parsing",
      progressPercent: 38,
      label: "Parsing workbooks",
      detail: "Parsed 2/5 workbook(s). Current file: views.xlsx.",
      totalFiles: 5,
      parsedFiles: 2,
    },
    result: null,
    error: null,
    createdAt: "2026-04-07T12:00:00.000Z",
    startedAt: "2026-04-07T12:00:05.000Z",
    completedAt: null,
  });
  assert.ok(running);
  if (!running) return;
  assert.equal(running.progress?.phase, "parsing");
  assert.equal(shouldPollUploadJob(running.status), true);

  const completed = parseUploadJobStatusResponse({
    jobId: "run_done",
    status: "completed",
    progress: {
      phase: "completed",
      progressPercent: 100,
      label: "Completed",
      detail: "Upload finished successfully.",
      totalFiles: 5,
      parsedFiles: 5,
    },
    result: {
      inserted: 12,
      updated: 8,
      untouched: 90,
      notes: { inserted: 3, updated: 2, untouched: 20 },
      accountDaily: { inserted: 9, updated: 6, untouched: 70 },
      summary: {
        filesProcessed: 5,
        filesFailed: 0,
        noteRowsInPayload: 15,
        accountDailyRowsInPayload: 88,
        totalBytes: 123456,
      },
      warnings: ["Duplicate note merged"],
      kpiSaved: true,
      sources: [{ fileName: "a.xlsx", pathname: "upload-jobs/run/a.xlsx", size: 1000 }],
    },
    error: null,
    createdAt: "2026-04-07T12:00:00.000Z",
    startedAt: "2026-04-07T12:00:05.000Z",
    completedAt: "2026-04-07T12:01:00.000Z",
  });
  assert.ok(completed);
  if (!completed) return;
  assert.equal(completed.result?.summary?.filesProcessed, 5);
  assert.equal(completed.result?.kpiSaved, true);
  assert.equal(shouldPollUploadJob(completed.status), false);
});

test("client upload status helpers reject malformed job responses", async () => {
  const mod = await import("./clientStatus").catch(() => null);

  assert.ok(mod, "clientStatus helpers should exist");
  if (!mod) return;

  const { parseUploadJobStatusResponse } = mod;

  const parsed = parseUploadJobStatusResponse({
    jobId: "run_bad",
    status: "running",
    progress: {
      phase: "parsing",
      progressPercent: "38",
      label: "Parsing workbooks",
      detail: "bad",
      totalFiles: 5,
      parsedFiles: 2,
    },
    result: null,
    error: null,
    createdAt: "2026-04-07T12:00:00.000Z",
    startedAt: null,
    completedAt: null,
  });

  assert.equal(parsed, null);
});
