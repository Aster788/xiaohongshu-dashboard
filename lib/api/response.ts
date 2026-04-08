import { NextResponse } from "next/server";

type ErrorStatus = 400 | 401 | 404 | 413 | 415 | 422 | 500;

export function errorJson(message: string, status: ErrorStatus) {
  return NextResponse.json({ error: message }, { status });
}

export function badRequest(message: string) {
  return errorJson(message, 400);
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFound(message = "Not found") {
  return errorJson(message, 404);
}

export function payloadTooLarge(message: string) {
  return errorJson(message, 413);
}

export function unsupportedMediaType(message: string) {
  return errorJson(message, 415);
}

export function unprocessableEntity(message: string) {
  return errorJson(message, 422);
}

export function serverError(message: string) {
  return errorJson(message, 500);
}

export function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
