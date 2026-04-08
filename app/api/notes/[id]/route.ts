import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { badRequest, notFound, unauthorizedJson } from "@/lib/api/response";
import { isUploadRequestAuthorized } from "@/lib/auth/uploadSecret";
import { isValidPostUrl } from "@/lib/notes/postUrl";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * PATCH /api/notes/:id — set or clear postUrl (Bearer UPLOAD_SECRET when configured).
 * Body: { postUrl: string | null }; string must be non-empty http(s) URL after trim.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isUploadRequestAuthorized(request)) {
    return unauthorizedJson();
  }

  const { id } = await context.params;

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
  if (!("postUrl" in o)) {
    return badRequest("Missing postUrl");
  }

  const postUrl = o.postUrl;
  let nextUrl: string | null;

  if (postUrl === null) {
    nextUrl = null;
  } else if (typeof postUrl === "string") {
    const trimmed = postUrl.trim();
    if (trimmed === "") {
      return badRequest("Invalid postUrl");
    }
    if (!isValidPostUrl(trimmed)) {
      return badRequest("Invalid postUrl");
    }
    nextUrl = trimmed;
  } else {
    return badRequest("Invalid postUrl");
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
      return notFound();
    }
    throw e;
  }
}
