/**
 * Upload-related API authorization (PRD: Bearer UPLOAD_SECRET).
 * When UPLOAD_SECRET is unset, checks pass (local dev).
 * Multipart routes may also accept form field `uploadSecret` (legacy parity with parse).
 */

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function isUploadRequestAuthorized(
  request: Request,
  formData?: FormData,
): boolean {
  const expected = process.env.UPLOAD_SECRET;
  if (!expected) return true;

  const bearer = getBearerToken(request);
  if (bearer === expected) return true;

  if (formData) {
    const uploadSecret = formData.get("uploadSecret");
    if (typeof uploadSecret === "string" && uploadSecret === expected) {
      return true;
    }
  }

  return false;
}
