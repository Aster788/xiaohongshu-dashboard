import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { badRequest, formatDateOnlyUtc, unauthorizedJson } from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { parseIsoDateOnly } from "@/lib/excel/chineseDate";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePageLimit(
  pageRaw: string | null,
  limitRaw: string | null,
): { page: number; limit: number } {
  let page = Number.parseInt(pageRaw ?? "1", 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let limit = Number.parseInt(limitRaw ?? "20", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  return { page, limit };
}

/**
 * GET /api/notes — list notes for Post links UI (Bearer UPLOAD_SECRET when configured).
 * Query: q (title substring, case-insensitive), year, from, to (YYYY-MM-DD), page, limit (max 100).
 */
export async function GET(request: Request) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const yearStr = url.searchParams.get("year");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const { page, limit } = parsePageLimit(
    url.searchParams.get("page"),
    url.searchParams.get("limit"),
  );

  const and: Prisma.NoteWhereInput[] = [];

  if (q) {
    and.push({ title: { contains: q, mode: "insensitive" } });
  }

  if (yearStr !== null && yearStr !== "") {
    const y = Number.parseInt(yearStr, 10);
    if (!Number.isFinite(y) || y < 1 || y > 9999) {
      return badRequest("Invalid year");
    }
    and.push({
      publishedDate: {
        gte: new Date(Date.UTC(y, 0, 1)),
        lte: new Date(Date.UTC(y, 11, 31)),
      },
    });
  }

  if (fromStr !== null && fromStr !== "") {
    const d = parseIsoDateOnly(fromStr);
    if (!d) {
      return badRequest("Invalid from");
    }
    and.push({ publishedDate: { gte: d } });
  }

  if (toStr !== null && toStr !== "") {
    const d = parseIsoDateOnly(toStr);
    if (!d) {
      return badRequest("Invalid to");
    }
    and.push({ publishedDate: { lte: d } });
  }

  const where: Prisma.NoteWhereInput = and.length > 0 ? { AND: and } : {};
  const skip = (page - 1) * limit;

  const [total, rows] = await prisma.$transaction([
    prisma.note.count({ where }),
    prisma.note.findMany({
      where,
      orderBy: [{ publishedDate: "desc" }, { title: "asc" }],
      skip,
      take: limit,
    }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    publishedDate: formatDateOnlyUtc(row.publishedDate),
    format: row.format,
    impressions: row.impressions === null ? null : row.impressions.toString(),
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    saves: row.saves,
    shares: row.shares,
    followerGain: row.followerGain,
    postUrl: row.postUrl,
  }));

  return NextResponse.json(
    { items, page, limit, total },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
