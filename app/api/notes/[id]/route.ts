import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { isValidPostUrl } from "@/lib/notes/postUrl";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * PATCH /api/notes/:id — set or clear postUrl (Bearer UPLOAD_SECRET when configured).
 * Body: { postUrl: string | null }; string must be non-empty http(s) URL after trim.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorized();
  }

  const { id } = await context.params;

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
  if (!("postUrl" in o)) {
    return NextResponse.json({ error: "Missing postUrl" }, { status: 400 });
  }

  const postUrl = o.postUrl;
  let nextUrl: string | null;

  if (postUrl === null) {
    nextUrl = null;
  } else if (typeof postUrl === "string") {
    const trimmed = postUrl.trim();
    if (trimmed === "") {
      return NextResponse.json({ error: "Invalid postUrl" }, { status: 400 });
    }
    if (!isValidPostUrl(trimmed)) {
      return NextResponse.json({ error: "Invalid postUrl" }, { status: 400 });
    }
    nextUrl = trimmed;
  } else {
    return NextResponse.json({ error: "Invalid postUrl" }, { status: 400 });
  }

  try {
    const updated = await prisma.note.update({
      where: { id },
      data: { postUrl: nextUrl },
    });
    return NextResponse.json({
      id: updated.id,
      postUrl: updated.postUrl,
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw e;
  }
}
