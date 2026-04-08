import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  badRequest,
  formatDateOnlyUtc,
  serverError,
  unauthorizedJson,
} from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { DASHBOARD_CACHE_TAG } from "@/lib/dashboard/queries";
import { parseIsoDateOnly } from "@/lib/excel/chineseDate";
import { prisma } from "@/lib/db";
import { parseNonNegativeInt } from "@/lib/validation/number";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/settings — load KPIs for /upload pre-fill.
 * Policy: when UPLOAD_SECRET is set, Bearer is required (same as PUT); no public read of KPIs.
 * When UPLOAD_SECRET is unset (dev), unauthenticated GET is allowed.
 */
export async function GET(request: Request) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!row) {
    return serverError("Settings row missing; run seed or migration");
  }

  return NextResponse.json({
    followers: row.followers,
    totalPosts: row.totalPosts,
    likesAndSaves: row.likesAndSaves,
    launchDate: formatDateOnlyUtc(row.launchDate),
  });
}

export async function PUT(request: Request) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return badRequest("Expected object body");
  }

  const o = body as Record<string, unknown>;
  const patch: {
    followers?: number;
    totalPosts?: number;
    likesAndSaves?: number;
    launchDate?: Date;
  } = {};

  if ("followers" in o) {
    const v = parseNonNegativeInt(o.followers);
    if (v === null) {
      return badRequest("Invalid followers");
    }
    patch.followers = v;
  }
  if ("totalPosts" in o) {
    const v = parseNonNegativeInt(o.totalPosts);
    if (v === null) {
      return badRequest("Invalid totalPosts");
    }
    patch.totalPosts = v;
  }
  if ("likesAndSaves" in o) {
    const v = parseNonNegativeInt(o.likesAndSaves);
    if (v === null) {
      return badRequest("Invalid likesAndSaves");
    }
    patch.likesAndSaves = v;
  }
  if ("launchDate" in o) {
    if (typeof o.launchDate !== "string") {
      return badRequest("Invalid launchDate");
    }
    const d = parseIsoDateOnly(o.launchDate);
    if (!d) {
      return badRequest("Invalid launchDate");
    }
    patch.launchDate = d;
  }

  if (Object.keys(patch).length === 0) {
    return badRequest("No valid fields to update");
  }

  const updated = await prisma.settings.upsert({
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
  revalidateTag(DASHBOARD_CACHE_TAG);

  return NextResponse.json({
    followers: updated.followers,
    totalPosts: updated.totalPosts,
    likesAndSaves: updated.likesAndSaves,
    launchDate: formatDateOnlyUtc(updated.launchDate),
  });
}
