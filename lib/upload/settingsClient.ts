export type SettingsResponse = {
  followers: number;
  totalPosts: number;
  likesAndSaves: number;
  launchDate: string;
};

export type SaveSettingsPayload = {
  followers: number;
  totalPosts: number;
  likesAndSaves: number;
  launchDate: string;
};

type SettingsResult =
  | { ok: true; data: SettingsResponse }
  | { ok: false; status: number; error: string };

function readApiError(data: unknown, fallback: string): string {
  return data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
    ? (data as { error: string }).error
    : fallback;
}

function isSettingsResponse(x: unknown): x is SettingsResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.followers === "number" &&
    typeof o.totalPosts === "number" &&
    typeof o.likesAndSaves === "number" &&
    typeof o.launchDate === "string"
  );
}

function authHeaders(secret: string): HeadersInit {
  const headers: HeadersInit = {};
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return headers;
}

export async function fetchSettings(secret: string): Promise<SettingsResult> {
  const res = await fetch("/api/settings", { headers: authHeaders(secret) });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(data, `Request failed (${res.status})`),
    };
  }
  if (!isSettingsResponse(data)) {
    return { ok: false, status: 500, error: "Unexpected settings response." };
  }
  return { ok: true, data };
}

export async function saveSettings(
  secret: string,
  payload: SaveSettingsPayload,
): Promise<SettingsResult> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { ...authHeaders(secret), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(data, `Save failed (${res.status})`),
    };
  }
  if (!isSettingsResponse(data)) {
    return { ok: false, status: 500, error: "Unexpected settings response." };
  }
  return { ok: true, data };
}
