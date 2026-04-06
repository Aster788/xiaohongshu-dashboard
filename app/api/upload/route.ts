import { NextResponse } from "next/server";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { combineDomainIngests, ingestDomainFromXlsxBuffer } from "@/lib/excel/domainWorkbook";
import type { DomainWorkbookResult } from "@/lib/excel/domainTypes";
import { prisma } from "@/lib/db";
import { mergeDomainIntoDb } from "@/lib/merge/mergeIngest";
import { parseOptionalKpiFormFields } from "@/lib/settings/formKpi";

export const runtime = "nodejs";

/**
 * Persists ingested rows to PostgreSQL. For raw grid preview only, use POST /api/excel/parse (same Bearer / form secret).
 */

const MAX_FILES = 12;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function collectXlsxFiles(formData: FormData): File[] {
  const raw = [...formData.getAll("files"), ...formData.getAll("files[]")];
  return raw.filter((x): x is File => x instanceof File);
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  if (!isUploadRequestAuthorized(request, formData)) {
    return unauthorized();
  }

  const kpiParsed = parseOptionalKpiFormFields(formData);
  if (!kpiParsed.ok) {
    return NextResponse.json({ error: kpiParsed.message }, { status: 400 });
  }

  const files = collectXlsxFiles(formData);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files (use field name files or files[])" }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files (max ${MAX_FILES})` },
      { status: 400 },
    );
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "Total upload size too large" }, { status: 413 });
    }
    if (file.size > MAX_BYTES_PER_FILE) {
      return NextResponse.json(
        { error: `File too large: ${file.name} (max ${MAX_BYTES_PER_FILE} bytes per file)` },
        { status: 413 },
      );
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: `Only .xlsx supported: rejected ${file.name}` },
        { status: 400 },
      );
    }
  }

  const parsed = await Promise.all(
    files.map(async (file) => {
      const buf = await file.arrayBuffer();
      try {
        const part = await ingestDomainFromXlsxBuffer(buf, {
          fileName: file.name,
          referenceDate: new Date(file.lastModified),
        });
        return { ok: true as const, part };
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to parse workbook";
        return { ok: false as const, fileName: file.name, message };
      }
    }),
  );

  const ingestParts: DomainWorkbookResult[] = [];
  const parseErrors: { fileName: string; message: string }[] = [];
  for (const r of parsed) {
    if (r.ok) ingestParts.push(r.part);
    else parseErrors.push({ fileName: r.fileName, message: r.message });
  }

  if (parseErrors.length > 0 && ingestParts.length === 0) {
    return NextResponse.json(
      {
        error: "All workbooks failed to parse",
        errors: parseErrors,
      },
      { status: 422 },
    );
  }

  const combined = combineDomainIngests(ingestParts);
  const mergeResult = await mergeDomainIntoDb(prisma, combined);

  const patch = kpiParsed.patch;
  if (Object.keys(patch).length > 0) {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        followers: patch.followers ?? 0,
        totalPosts: patch.totalPosts ?? 0,
        likesAndSaves: patch.likesAndSaves ?? 0,
        launchDate: patch.launchDate ?? new Date("2025-06-15T00:00:00.000Z"),
      },
      update: patch,
    });
  }

  return NextResponse.json({
    inserted: mergeResult.inserted,
    updated: mergeResult.updated,
    untouched: mergeResult.untouched,
    notes: mergeResult.notes,
    accountDaily: mergeResult.accountDaily,
    summary: {
      filesProcessed: ingestParts.length,
      filesFailed: parseErrors.length,
      noteRowsInPayload: combined.notes.length,
      accountDailyRowsInPayload: combined.accountDaily.length,
    },
    warnings: combined.warnings,
    ...(parseErrors.length > 0 ? { errors: parseErrors } : {}),
  });
}
