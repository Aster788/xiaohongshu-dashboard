export type NoteListItem = {
  id: string;
  title: string;
  publishedDate: string;
  format: string | null;
  impressions: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  followerGain: number | null;
  postUrl: string | null;
};

export type NotesListResponse = {
  items: NoteListItem[];
  page: number;
  limit: number;
  total: number;
};

export type NotesListQuery = {
  q?: string;
  year?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
};

export type NotesListResult =
  | { ok: true; data: NotesListResponse }
  | { ok: false; status: number; error: string };

export type PatchNotePostUrlResult =
  | { ok: true; postUrl: string | null }
  | { ok: false; status: number; error: string };

function readApiError(data: unknown, fallback: string): string {
  return data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
    ? (data as { error: string }).error
    : fallback;
}

function isNoteListItem(x: unknown): x is NoteListItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.publishedDate === "string"
  );
}

function isNotesListResponse(x: unknown): x is NotesListResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    Array.isArray(o.items) &&
    o.items.every(isNoteListItem) &&
    typeof o.page === "number" &&
    typeof o.limit === "number" &&
    typeof o.total === "number"
  );
}

function authHeaders(secret: string): HeadersInit {
  const headers: HeadersInit = {};
  if (secret) {
    headers.Authorization = `Bearer ${secret}`;
  }
  return headers;
}

export async function fetchNotesList(
  secret: string,
  query: NotesListQuery,
): Promise<NotesListResult> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.year) params.set("year", query.year);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  params.set("page", String(query.page));
  params.set("limit", String(query.limit));

  const res = await fetch(`/api/notes?${params.toString()}`, {
    headers: authHeaders(secret),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(data, `Request failed (${res.status})`),
    };
  }
  if (!isNotesListResponse(data)) {
    return { ok: false, status: 500, error: "Unexpected notes response." };
  }
  return { ok: true, data };
}

export async function patchNotePostUrl(
  secret: string,
  noteId: string,
  postUrl: string | null,
): Promise<PatchNotePostUrlResult> {
  const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
    method: "PATCH",
    headers: {
      ...authHeaders(secret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ postUrl }),
  });
  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: readApiError(
        data,
        `${postUrl === null ? "Clear" : "Save"} failed (${res.status})`,
      ),
    };
  }
  if (!data || typeof data !== "object" || !("postUrl" in data)) {
    return { ok: false, status: 500, error: "Unexpected save response." };
  }
  const raw = (data as { postUrl: unknown }).postUrl;
  return {
    ok: true,
    postUrl: raw === null ? null : typeof raw === "string" ? raw : null,
  };
}
