import { parseIsoDateOnly } from "@/lib/excel/chineseDate";
import { parseNonNegativeInt } from "@/lib/validation/number";

export type KpiFormPatch = {
  followers?: number;
  totalPosts?: number;
  likesAndSaves?: number;
  launchDate?: Date;
};

/**
 * Optional KPI fields on multipart upload (same semantics as PUT /api/settings JSON body).
 * Omitted fields are left unchanged.
 */
export function parseOptionalKpiFormFields(formData: FormData): {
  ok: true;
  patch: KpiFormPatch;
} | { ok: false; message: string } {
  const patch: KpiFormPatch = {};

  const followers = formData.get("followers");
  if (followers !== null && String(followers).trim() !== "") {
    const v = parseNonNegativeInt(followers);
    if (v === null) return { ok: false, message: "Invalid followers" };
    patch.followers = v;
  }

  const totalPosts = formData.get("totalPosts");
  if (totalPosts !== null && String(totalPosts).trim() !== "") {
    const v = parseNonNegativeInt(totalPosts);
    if (v === null) return { ok: false, message: "Invalid totalPosts" };
    patch.totalPosts = v;
  }

  const likesAndSaves = formData.get("likesAndSaves");
  if (likesAndSaves !== null && String(likesAndSaves).trim() !== "") {
    const v = parseNonNegativeInt(likesAndSaves);
    if (v === null) return { ok: false, message: "Invalid likesAndSaves" };
    patch.likesAndSaves = v;
  }

  const launchDate = formData.get("launchDate");
  if (launchDate !== null && String(launchDate).trim() !== "") {
    if (typeof launchDate !== "string") {
      return { ok: false, message: "Invalid launchDate" };
    }
    const d = parseIsoDateOnly(launchDate.trim().slice(0, 10));
    if (!d) return { ok: false, message: "Invalid launchDate" };
    patch.launchDate = d;
  }

  return { ok: true, patch };
}
