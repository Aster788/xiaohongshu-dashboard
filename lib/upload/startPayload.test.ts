import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedUploadBlobPath, parseUploadStartPayload } from "./startPayload";

function makeSource(index: number) {
  return {
    fileName: `report-${index}.xlsx`,
    pathname: `upload-jobs/batch-123/${String(index).padStart(2, "0")}-report-${index}.xlsx`,
    url: `https://blob.example.com/upload-jobs/batch-123/${String(index).padStart(2, "0")}-report-${index}.xlsx`,
    downloadUrl: `https://blob.example.com/upload-jobs/batch-123/${String(index).padStart(2, "0")}-report-${index}.xlsx?download=1`,
    size: 1024 * (index + 1),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    uploadedAt: "2026-04-07T12:00:00.000Z",
  };
}

test("isAllowedUploadBlobPath only accepts xlsx files under upload-jobs", () => {
  assert.equal(isAllowedUploadBlobPath("upload-jobs/batch-123/00-trend.xlsx"), true);
  assert.equal(isAllowedUploadBlobPath("upload-jobs/batch-123/00-trend.xls"), false);
  assert.equal(isAllowedUploadBlobPath("other-prefix/batch-123/00-trend.xlsx"), false);
});

test("parseUploadStartPayload accepts blob sources and optional KPI patch", () => {
  const result = parseUploadStartPayload({
    sources: [makeSource(0), makeSource(1), makeSource(2), makeSource(3), makeSource(4)],
    kpiPatch: {
      followers: 1200,
      totalPosts: 75,
      likesAndSaves: 9900,
      launchDate: "2025-06-15",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.payload.sources.length, 5);
  assert.equal(result.payload.totalBytes, 15_360);
  assert.deepEqual(result.payload.kpiPatch, {
    followers: 1200,
    totalPosts: 75,
    likesAndSaves: 9900,
    launchDate: new Date("2025-06-15T00:00:00.000Z"),
  });
});

test("parseUploadStartPayload rejects invalid blob sources", () => {
  const result = parseUploadStartPayload({
    sources: [
      makeSource(0),
      {
        ...makeSource(1),
        fileName: "bad.txt",
        pathname: "upload-jobs/batch-123/01-bad.txt",
      },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /Only \.xlsx supported/i);
});

test("parseUploadStartPayload rejects excessive file counts", () => {
  const result = parseUploadStartPayload({
    sources: Array.from({ length: 13 }, (_, index) => makeSource(index)),
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /Too many files/i);
});
