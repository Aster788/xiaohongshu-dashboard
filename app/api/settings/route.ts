import { NextResponse } from "next/server";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { parseIsoDateOnly } from "@/lib/excel/chineseDate";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/settings — load KPIs for /upload pre-fill.
 * Policy: when UPLOAD_SECRET is set, Bearer is required (same as PUT); no public read of KPIs.
 * When UPLOAD_SECRET is unset (dev), unauthenticated GET is allowed.
 */
function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

export async function GET(request: Request) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorized();
  }

  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!row) {
    return NextResponse.json(
      { error: "Settings row missing; run seed or migration" },
      { status: 500 },
    );
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
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Expected object body" }, { status: 400 });
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
      return NextResponse.json({ error: "Invalid followers" }, { status: 400 });
    }
    patch.followers = v;
  }
  if ("totalPosts" in o) {
    const v = parseNonNegativeInt(o.totalPosts);
    if (v === null) {
      return NextResponse.json({ error: "Invalid totalPosts" }, { status: 400 });
    }
    patch.totalPosts = v;
  }
  if ("likesAndSaves" in o) {
    const v = parseNonNegativeInt(o.likesAndSaves);
    if (v === null) {
      return NextResponse.json({ error: "Invalid likesAndSaves" }, { status: 400 });
    }
    patch.likesAndSaves = v;
  }
  if ("launchDate" in o) {
    if (typeof o.launchDate !== "string") {
      return NextResponse.json({ error: "Invalid launchDate" }, { status: 400 });
    }
    const d = parseIsoDateOnly(o.launchDate);
    if (!d) {
      return NextResponse.json({ error: "Invalid launchDate" }, { status: 400 });
    }
    patch.launchDate = d;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
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

  return NextResponse.json({
    followers: updated.followers,
    totalPosts: updated.totalPosts,
    likesAndSaves: updated.likesAndSaves,
    launchDate: formatDateOnlyUtc(updated.launchDate),
  });
}
