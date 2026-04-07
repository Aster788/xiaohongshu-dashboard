"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeWorkbookParseResults } from "@/lib/excel/workbookMerge";
import type { WorkbookParseResult } from "@/lib/excel/workbookTypes";
import { mapWithConcurrency } from "@/lib/upload/async";
import {
  parseUploadJobStatusResponse,
  shouldPollUploadJob,
  type ClientUploadJobStatusResponse,
  type UploadMergeSnapshot,
} from "@/lib/upload/clientStatus";
import { buildUploadBlobPath } from "@/lib/upload/progress";

const NOTES_PAGE_SIZE = 20;

type ManualKpi = {
  followersTotal: string;
  likesAndSavesTotal: string;
  totalPosts: string;
  launchDate: string;
};

type SettingsResponse = {
  followers: number;
  totalPosts: number;
  likesAndSaves: number;
  launchDate: string;
};

type NoteListItem = {
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

type TableMergeStats = {
  inserted: number;
  updated: number;
  untouched: number;
};

type QueuedUploadJob = {
  jobId: string;
  status: "queued";
  filesQueued: number;
  totalBytes: number;
  kpiSaved: boolean;
  sources: Array<{
    fileName: string;
    pathname: string;
    size: number;
  }>;
};

const emptyManual: ManualKpi = {
  followersTotal: "",
  likesAndSavesTotal: "",
  totalPosts: "",
  launchDate: "",
};

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

function isNoteListItem(x: unknown): x is NoteListItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.publishedDate === "string"
  );
}

function isNotesListResponse(
  x: unknown,
): x is { items: NoteListItem[]; page: number; limit: number; total: number } {
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

function isTableMergeStats(x: unknown): x is TableMergeStats {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.inserted === "number" &&
    typeof o.updated === "number" &&
    typeof o.untouched === "number"
  );
}

function parseQueuedUploadJob(data: unknown): QueuedUploadJob | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (
    typeof o.jobId !== "string" ||
    o.status !== "queued" ||
    typeof o.filesQueued !== "number" ||
    typeof o.totalBytes !== "number" ||
    typeof o.kpiSaved !== "boolean" ||
    !Array.isArray(o.sources)
  ) {
    return null;
  }

  const sources = o.sources.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (
      typeof row.fileName !== "string" ||
      typeof row.pathname !== "string" ||
      typeof row.size !== "number"
    ) {
      return [];
    }
    return [
      {
        fileName: row.fileName,
        pathname: row.pathname,
        size: row.size,
      },
    ];
  });

  if (sources.length !== o.sources.length) return null;

  return {
    jobId: o.jobId,
    status: "queued",
    filesQueued: o.filesQueued,
    totalBytes: o.totalBytes,
    kpiSaved: o.kpiSaved,
    sources,
  };
}

/** Same rules as PUT /api/settings: all four fields required and valid. */
function validateManualKpiForSave(manual: ManualKpi): string | null {
  const followers = Number.parseInt(manual.followersTotal.trim(), 10);
  if (manual.followersTotal.trim() === "" || Number.isNaN(followers) || followers < 0) {
    return "Followers must be a non-negative integer.";
  }
  const totalPosts = Number.parseInt(manual.totalPosts.trim(), 10);
  if (manual.totalPosts.trim() === "" || Number.isNaN(totalPosts) || totalPosts < 0) {
    return "Total posts must be a non-negative integer.";
  }
  const likesAndSaves = Number.parseInt(manual.likesAndSavesTotal.trim(), 10);
  if (
    manual.likesAndSavesTotal.trim() === "" ||
    Number.isNaN(likesAndSaves) ||
    likesAndSaves < 0
  ) {
    return "Likes and saves must be a non-negative integer.";
  }
  const launchDate = manual.launchDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
    return "Launch date must be set (YYYY-MM-DD).";
  }
  return null;
}

export default function UploadPage() {
  const [uploadSecret, setUploadSecret] = useState("");
  const [manual, setManual] = useState<ManualKpi>(emptyManual);
  const [mergeSnapshot, setMergeSnapshot] = useState<UploadMergeSnapshot | null>(null);
  const [queuedUploadJob, setQueuedUploadJob] = useState<QueuedUploadJob | null>(null);
  const [uploadJobStatus, setUploadJobStatus] =
    useState<ClientUploadJobStatusResponse | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [includeKpisWithUpload, setIncludeKpisWithUpload] = useState(false);
  const [settingsHint, setSettingsHint] = useState<string | null>(null);
  const [savingKpi, setSavingKpi] = useState(false);
  const [debugParsed, setDebugParsed] = useState<WorkbookParseResult | null>(null);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const loadSeq = useRef(0);
  const notesLoadSeq = useRef(0);
  const [notesQ, setNotesQ] = useState("");
  const [notesYear, setNotesYear] = useState("");
  const [notesFrom, setNotesFrom] = useState("");
  const [notesTo, setNotesTo] = useState("");
  const [notesPage, setNotesPage] = useState(1);
  const [appliedNotesFilters, setAppliedNotesFilters] = useState({
    q: "",
    year: "",
    from: "",
    to: "",
  });
  const [notesItems, setNotesItems] = useState<NoteListItem[]>([]);
  const [notesTotal, setNotesTotal] = useState(0);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesHint, setNotesHint] = useState<string | null>(null);
  const [postLinkRowHint, setPostLinkRowHint] = useState<Record<string, string>>(
    {},
  );
  const [draftUrls, setDraftUrls] = useState<Record<string, string>>({});
  const [rowActionId, setRowActionId] = useState<string | null>(null);
  const completedUploadJobIdRef = useRef<string | null>(null);

  const notesQueryRef = useRef({
    secret: "",
    filters: { q: "", year: "", from: "", to: "" } as {
      q: string;
      year: string;
      from: string;
      to: string;
    },
    page: 1,
  });
  // Keep in sync during render (not in useEffect) so event handlers never read stale
  // secret/filters before the effect runs — otherwise post-mutation refetch can 401 or
  // use wrong query and overwrite Clear with old rows.
  notesQueryRef.current = {
    secret: uploadSecret.trim(),
    filters: appliedNotesFilters,
    page: notesPage,
  };

  const manualSnapshot = useMemo(
    () => ({
      followersTotal: manual.followersTotal.trim() || null,
      likesAndSavesTotal: manual.likesAndSavesTotal.trim() || null,
      totalPosts: manual.totalPosts.trim() || null,
      launchDate: manual.launchDate.trim() || null,
    }),
    [manual],
  );

  const applySettingsToForm = useCallback((s: SettingsResponse) => {
    setManual({
      followersTotal: String(s.followers),
      likesAndSavesTotal: String(s.likesAndSaves),
      totalPosts: String(s.totalPosts),
      launchDate: s.launchDate,
    });
  }, []);

  useEffect(() => {
    const seq = ++loadSeq.current;
    const secret = uploadSecret.trim();
    const t = window.setTimeout(() => {
      const headers: HeadersInit = {};
      if (secret) {
        headers.Authorization = `Bearer ${secret}`;
      }

      void (async () => {
        try {
          const res = await fetch("/api/settings", { headers });
          const data: unknown = await res.json().catch(() => null);

          if (seq !== loadSeq.current) return;

          if (!res.ok) {
            if (res.status === 401 && secret) {
              setSettingsHint("Could not load saved KPIs. Check the upload secret.");
            } else if (res.status === 401 && !secret) {
              setSettingsHint(
                "Enter the upload secret to load saved KPIs from the server.",
              );
            } else {
              const msg =
                data &&
                typeof data === "object" &&
                "error" in data &&
                typeof (data as { error: unknown }).error === "string"
                  ? (data as { error: string }).error
                  : `Request failed (${res.status})`;
              setSettingsHint(msg);
            }
            return;
          }

          if (!isSettingsResponse(data)) {
            setSettingsHint("Unexpected settings response.");
            return;
          }

          setSettingsHint(null);
          applySettingsToForm(data);
        } catch {
          if (seq === loadSeq.current) {
            setSettingsHint("Network error while loading settings.");
          }
        }
      })();
    }, 300);

    return () => window.clearTimeout(t);
  }, [uploadSecret, applySettingsToForm]);

  async function fetchNotesListNow(opts?: { silent?: boolean }) {
    const seq = ++notesLoadSeq.current;
    if (!opts?.silent) {
      setNotesLoading(true);
      setNotesHint(null);
    }
    const { secret, filters, page } = notesQueryRef.current;
    const headers: HeadersInit = {};
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.year) params.set("year", filters.year);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(page));
    params.set("limit", String(NOTES_PAGE_SIZE));

    try {
      const res = await fetch(`/api/notes?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      const data: unknown = await res.json().catch(() => null);

      if (seq !== notesLoadSeq.current) {
        return;
      }

      if (!res.ok) {
        if (res.status === 401 && secret) {
          setNotesHint("Unauthorized. Check the upload secret.");
        } else if (res.status === 401 && !secret) {
          setNotesHint("Enter the upload secret to load notes for Post links.");
        } else {
          const msg =
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : `Request failed (${res.status})`;
          setNotesHint(msg);
        }
        setNotesItems([]);
        setNotesTotal(0);
        setDraftUrls({});
        setPostLinkRowHint({});
        return;
      }

      if (!isNotesListResponse(data)) {
        setNotesHint("Unexpected notes response.");
        setNotesItems([]);
        setNotesTotal(0);
        setDraftUrls({});
        setPostLinkRowHint({});
        return;
      }

      setNotesItems(data.items);
      setNotesTotal(data.total);
      setDraftUrls(
        Object.fromEntries(
          data.items.map((item) => [item.id, item.postUrl ?? ""]),
        ),
      );
      setPostLinkRowHint({});
    } catch {
      if (seq === notesLoadSeq.current) {
        setNotesHint("Network error while loading notes.");
        setNotesItems([]);
        setNotesTotal(0);
        setDraftUrls({});
        setPostLinkRowHint({});
      }
    } finally {
      if (seq === notesLoadSeq.current) {
        setNotesLoading(false);
      }
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchNotesListNow();
    }, 300);
    return () => window.clearTimeout(t);
    // fetchNotesListNow reads notesQueryRef + state setters only; listing deps match filter inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional debounce trigger set
  }, [uploadSecret, appliedNotesFilters, notesPage]);

  useEffect(() => {
    if (!queuedUploadJob) return;

    let cancelled = false;
    let timer: number | null = null;
    const secret = uploadSecret.trim();
    const headers: HeadersInit = {};
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    const refreshAfterCompletion = async (status: ClientUploadJobStatusResponse) => {
      if (completedUploadJobIdRef.current === status.jobId) return;
      completedUploadJobIdRef.current = status.jobId;

      if (status.result?.kpiSaved) {
        const refreshed = await fetch("/api/settings", { headers }).catch(() => null);
        if (!cancelled && refreshed?.ok) {
          const data: unknown = await refreshed.json().catch(() => null);
          if (isSettingsResponse(data)) {
            applySettingsToForm(data);
          }
        }
      }

      if (!cancelled) {
        void fetchNotesListNow({ silent: true });
      }
    };

    const schedulePoll = (delayMs: number) => {
      if (cancelled) return;
      timer = window.setTimeout(() => {
        void pollStatus();
      }, delayMs);
    };

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/upload/${queuedUploadJob.jobId}`, {
          headers,
          cache: "no-store",
        });
        const data: unknown = await res.json().catch(() => null);

        if (cancelled) return;

        if (res.status === 401) {
          setUploadError("Unauthorized. Check the upload secret.");
          return;
        }

        if (!res.ok) {
          const msg =
            data &&
            typeof data === "object" &&
            "error" in data &&
            typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : `Status check failed (${res.status})`;

          if (res.status >= 500) {
            setUploadError(`${msg}. Retrying…`);
            schedulePoll(2000);
            return;
          }

          setUploadError(msg);
          return;
        }

        const parsed = parseUploadJobStatusResponse(data);
        if (!parsed) {
          setUploadError("Unexpected upload job status response.");
          return;
        }

        setUploadJobStatus(parsed);
        if (parsed.result) {
          setMergeSnapshot(parsed.result);
        }
        setUploadError(parsed.error);

        if (shouldPollUploadJob(parsed.status)) {
          schedulePoll(1500);
          return;
        }

        if (parsed.status === "completed") {
          await refreshAfterCompletion(parsed);
        }
      } catch {
        if (cancelled) return;
        setUploadError("Network error while checking background status. Retrying…");
        schedulePoll(2000);
      }
    };

    schedulePoll(0);

    return () => {
      cancelled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
    // fetchNotesListNow reads refs/state-only internals and is intentionally reused here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedUploadJob, uploadSecret, applySettingsToForm]);

  async function persistUpload(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    const invalid = files.filter((f) => !f.name.toLowerCase().endsWith(".xlsx"));
    if (invalid.length > 0) {
      setMergeSnapshot(null);
      setUploadError(
        `Only .xlsx files are supported. Not accepted: ${invalid.map((f) => f.name).join(", ")}`,
      );
      return;
    }

    if (includeKpisWithUpload) {
      const kpiErr = validateManualKpiForSave(manual);
      if (kpiErr) {
        setUploadError(
          `${kpiErr} Fix KPI fields or turn off "Save KPI fields with this upload".`,
        );
        return;
      }
    }

    setUploadError(null);
    setMergeSnapshot(null);
    setQueuedUploadJob(null);
    setUploadJobStatus(null);
    completedUploadJobIdRef.current = null;
    setUploadLoading(true);

    const secret = uploadSecret.trim();
    const headers: Record<string, string> = {};
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    const uploadBatchId = crypto.randomUUID();

    try {
      const sources = await mapWithConcurrency(files, 3, async (file, index) => {
        const blobPath = buildUploadBlobPath({
          runId: uploadBatchId,
          fileIndex: index,
          fileName: file.name,
        });

        const blob = await upload(blobPath, file, {
          access: "private",
          handleUploadUrl: "/api/upload/blob",
          headers,
          multipart: file.size >= 5 * 1024 * 1024,
        });

        return {
          fileName: file.name,
          pathname: blob.pathname,
          url: blob.url,
          downloadUrl: blob.downloadUrl,
          size: file.size,
          contentType: file.type || blob.contentType,
          uploadedAt: new Date().toISOString(),
        };
      });

      const kickoffPayload = {
        sources,
        ...(includeKpisWithUpload
          ? {
              kpiPatch: {
                followers: manual.followersTotal.trim(),
                totalPosts: manual.totalPosts.trim(),
                likesAndSaves: manual.likesAndSavesTotal.trim(),
                launchDate: manual.launchDate.trim(),
              },
            }
          : {}),
      };

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(kickoffPayload),
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.status === 401) {
        setUploadError("Unauthorized. Check the upload secret.");
        return;
      }

      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Upload failed (${res.status})`;
        setUploadError(msg);
        return;
      }

      const queued = parseQueuedUploadJob(data);
      if (!queued) {
        setUploadError("Unexpected upload response.");
        return;
      }
      setQueuedUploadJob(queued);

      if (queued.kpiSaved) {
        const refreshed = await fetch("/api/settings", { headers }).catch(() => null);
        if (refreshed?.ok) {
          const s: unknown = await refreshed.json().catch(() => null);
          if (isSettingsResponse(s)) applySettingsToForm(s);
        }
      }
    } catch {
      setUploadError("Network error.");
    } finally {
      setUploadLoading(false);
    }
  }

  async function onDebugParseSelected(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;

    const invalid = files.filter((f) => !f.name.toLowerCase().endsWith(".xlsx"));
    if (invalid.length > 0) {
      setDebugParsed(null);
      setDebugError(
        `Only .xlsx files are supported. Not accepted: ${invalid.map((f) => f.name).join(", ")}`,
      );
      return;
    }

    setDebugError(null);
    setDebugParsed(null);
    setDebugLoading(true);

    const secret = uploadSecret.trim();
    const headers: HeadersInit = {};
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    try {
      const parts: { fileName: string; result: WorkbookParseResult }[] = [];

      for (const file of files) {
        const body = new FormData();
        body.set("file", file);

        const res = await fetch("/api/excel/parse", {
          method: "POST",
          body,
          headers,
        });
        const data: unknown = await res.json().catch(() => null);

        if (!res.ok) {
          const msg =
            res.status === 401
              ? "Unauthorized. Check the upload secret."
              : data &&
                  typeof data === "object" &&
                  "error" in data &&
                  typeof (data as { error: unknown }).error === "string"
                ? (data as { error: string }).error
                : `Request failed (${res.status})`;
          setDebugError(`${file.name}: ${msg}`);
          return;
        }

        parts.push({ fileName: file.name, result: data as WorkbookParseResult });
      }

      setDebugParsed(mergeWorkbookParseResults(parts));
    } catch {
      setDebugError("Network error.");
    } finally {
      setDebugLoading(false);
    }
  }

  async function saveKpis() {
    setSavingKpi(true);
    setSettingsHint(null);

    const secret = uploadSecret.trim();
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    const kpiErr = validateManualKpiForSave(manual);
    if (kpiErr) {
      setSettingsHint(kpiErr);
      setSavingKpi(false);
      return;
    }

    const followers = Number.parseInt(manual.followersTotal.trim(), 10);
    const totalPosts = Number.parseInt(manual.totalPosts.trim(), 10);
    const likesAndSaves = Number.parseInt(manual.likesAndSavesTotal.trim(), 10);
    const launchDate = manual.launchDate.trim();

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          followers,
          totalPosts,
          likesAndSaves,
          launchDate,
        }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          res.status === 401
            ? "Unauthorized. Check the upload secret."
            : data &&
                typeof data === "object" &&
                "error" in data &&
                typeof (data as { error: unknown }).error === "string"
              ? (data as { error: string }).error
              : `Save failed (${res.status})`;
        setSettingsHint(msg);
        return;
      }

      if (isSettingsResponse(data)) {
        applySettingsToForm(data);
      }
      setSettingsHint("KPIs saved.");
    } catch {
      setSettingsHint("Network error while saving KPIs.");
    } finally {
      setSavingKpi(false);
    }
  }

  function applyNotesSearch() {
    setNotesPage(1);
    setAppliedNotesFilters({
      q: notesQ.trim(),
      year: notesYear.trim(),
      from: notesFrom.trim(),
      to: notesTo.trim(),
    });
  }

  async function saveNotePostUrl(noteId: string) {
    const draft = (draftUrls[noteId] ?? "").trim();
    if (!draft) {
      setPostLinkRowHint((prev) => ({
        ...prev,
        [noteId]: "Enter a URL or use Clear to remove the link.",
      }));
      return;
    }

    setRowActionId(noteId);
    setPostLinkRowHint((prev) => {
      if (!(noteId in prev)) return prev;
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
    const secret = uploadSecret.trim();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ postUrl: draft }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.status === 401) {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: "Unauthorized. Check the upload secret.",
        }));
        return;
      }

      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Save failed (${res.status})`;
        setPostLinkRowHint((prev) => ({ ...prev, [noteId]: msg }));
        return;
      }

      if (
        data &&
        typeof data === "object" &&
        "id" in data &&
        "postUrl" in data &&
        typeof (data as { id: unknown }).id === "string"
      ) {
        notesLoadSeq.current += 1;
        const rawPu = (data as { postUrl: unknown }).postUrl;
        const postUrl =
          rawPu === null
            ? null
            : typeof rawPu === "string"
              ? rawPu
              : null;
        setNotesItems((rows) =>
          rows.map((r) => (r.id === noteId ? { ...r, postUrl } : r)),
        );
        setDraftUrls((d) => ({ ...d, [noteId]: postUrl ?? "" }));
        setNotesLoading(false);
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: "Post link saved.",
        }));
      } else {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: "Unexpected save response.",
        }));
      }
    } catch {
      setPostLinkRowHint((prev) => ({
        ...prev,
        [noteId]: "Network error while saving post link.",
      }));
    } finally {
      setRowActionId(null);
    }
  }

  async function clearNotePostUrl(noteId: string) {
    setRowActionId(noteId);
    setPostLinkRowHint((prev) => {
      if (!(noteId in prev)) return prev;
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
    const secret = uploadSecret.trim();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers.Authorization = `Bearer ${secret}`;
    }

    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, {
        method: "PATCH",
        headers,
        body: '{"postUrl":null}',
      });
      const data: unknown = await res.json().catch(() => null);

      if (res.status === 401) {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: "Unauthorized. Check the upload secret.",
        }));
        return;
      }

      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Clear failed (${res.status})`;
        setPostLinkRowHint((prev) => ({ ...prev, [noteId]: msg }));
        return;
      }

      notesLoadSeq.current += 1;
      setNotesItems((rows) =>
        rows.map((r) => (r.id === noteId ? { ...r, postUrl: null } : r)),
      );
      setDraftUrls((d) => ({ ...d, [noteId]: "" }));
      setPostLinkRowHint((prev) => ({
        ...prev,
        [noteId]: "Post link cleared.",
      }));
      setNotesLoading(false);
    } catch {
      setPostLinkRowHint((prev) => ({
        ...prev,
        [noteId]: "Network error while clearing post link.",
      }));
    } finally {
      setRowActionId(null);
    }
  }

  const notesPageCount = Math.max(1, Math.ceil(notesTotal / NOTES_PAGE_SIZE));

  return (
    <main>
      <h1>Upload</h1>

      <section aria-label="Upload and merge">
        <h2>Import workbooks</h2>
        <p>
          Select one or more official export files (.xlsx). Files upload to Blob first,
          then <code>POST /api/upload</code> queues a background workflow that parses and
          writes them to the database. Hold Ctrl (Windows) or Command (macOS) to pick
          multiple files.
        </p>
        <div>
          <label htmlFor="upload-secret">Upload secret</label>
          <input
            id="upload-secret"
            name="uploadSecret"
            type="password"
            autoComplete="off"
            value={uploadSecret}
            onChange={(e) => setUploadSecret(e.target.value)}
          />
          <p>Required when <code>UPLOAD_SECRET</code> is set (use Authorization Bearer).</p>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={includeKpisWithUpload}
              onChange={(e) => setIncludeKpisWithUpload(e.target.checked)}
            />{" "}
            Save KPI fields with this upload
          </label>
          <p>
            When enabled, the same KPI values as in Manual KPI below are sent with the
            upload request (<code>followers</code>, <code>totalPosts</code>,{" "}
            <code>likesAndSaves</code>, <code>launchDate</code>) and must be valid before
            the background job is queued. Omitted when unchecked (use Save KPIs for{" "}
            <code>PUT /api/settings</code> only).
          </p>
        </div>
        <div
          style={{
            border: "1px solid #ccc",
            padding: "12px",
            marginTop: "8px",
            marginBottom: "8px",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void persistUpload(e.dataTransfer.files);
          }}
        >
          <label htmlFor="excel-files">Excel files (.xlsx)</label>
          <input
            id="excel-files"
            name="files"
            type="file"
            multiple
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={uploadLoading}
            onChange={(e) => void persistUpload(e.target.files)}
          />
          <p>Or drop files here.</p>
        </div>
        {uploadLoading ? <p>Uploading files to Blob and queueing background job…</p> : null}
        {uploadError ? (
          <p role="alert">
            Error: {uploadError}
          </p>
        ) : null}
        {queuedUploadJob ? (
          <div
            style={{
              border: "1px solid #ccc",
              padding: "12px",
              marginTop: "8px",
            }}
          >
            <h3>Background job</h3>
            <p>
              Job ID: <code>{queuedUploadJob.jobId}</code>
            </p>
            <p>
              Workflow status: <strong>{uploadJobStatus?.status ?? queuedUploadJob.status}</strong>
            </p>
            {uploadJobStatus?.progress ? (
              <>
                <p>
                  Progress: {uploadJobStatus.progress.progressPercent}% -{" "}
                  {uploadJobStatus.progress.label}
                </p>
                <p>{uploadJobStatus.progress.detail}</p>
              </>
            ) : (
              <p>Waiting for workflow progress…</p>
            )}
            <p>
              Files uploaded to Blob: {queuedUploadJob.filesQueued} (
              {queuedUploadJob.totalBytes.toLocaleString()} bytes)
            </p>
            <ul>
              {queuedUploadJob.sources.map((source) => (
                <li key={source.pathname}>
                  {source.fileName} {"->"} <code>{source.pathname}</code>
                </li>
              ))}
            </ul>
            <p>
              Status endpoint: <code>/api/upload/{queuedUploadJob.jobId}</code>
            </p>
            {uploadJobStatus?.completedAt ? (
              <p>Completed at: {new Date(uploadJobStatus.completedAt).toLocaleString()}</p>
            ) : null}
            {uploadJobStatus?.status === "completed" ? (
              <p>Background import finished. Merge results are shown below.</p>
            ) : null}
            {uploadJobStatus?.status === "failed" || uploadJobStatus?.status === "cancelled" ? (
              <p role="alert">
                Background import stopped: {uploadJobStatus.error ?? "Workflow did not complete."}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-label="Merge preview">
        <h2>Merge preview</h2>
        <p>Counts from the last successful import (inserted / updated / untouched).</p>
        {mergeSnapshot ? (
          <>
            <h3>Overall</h3>
            <ul>
              <li>Inserted: {mergeSnapshot.inserted}</li>
              <li>Updated: {mergeSnapshot.updated}</li>
              <li>Untouched: {mergeSnapshot.untouched}</li>
            </ul>
            {mergeSnapshot.notes ? (
              <>
                <h3>Notes</h3>
                <ul>
                  <li>Inserted: {mergeSnapshot.notes.inserted}</li>
                  <li>Updated: {mergeSnapshot.notes.updated}</li>
                  <li>Untouched: {mergeSnapshot.notes.untouched}</li>
                </ul>
              </>
            ) : null}
            {mergeSnapshot.accountDaily ? (
              <>
                <h3>Account daily</h3>
                <ul>
                  <li>Inserted: {mergeSnapshot.accountDaily.inserted}</li>
                  <li>Updated: {mergeSnapshot.accountDaily.updated}</li>
                  <li>Untouched: {mergeSnapshot.accountDaily.untouched}</li>
                </ul>
              </>
            ) : null}
            {mergeSnapshot.summary ? (
              <>
                <h3>Payload summary</h3>
                <pre>{JSON.stringify(mergeSnapshot.summary, null, 2)}</pre>
              </>
            ) : null}
            {mergeSnapshot.warnings && mergeSnapshot.warnings.length > 0 ? (
              <>
                <h3>Warnings</h3>
                <ul>
                  {mergeSnapshot.warnings.map((w, i) => (
                    <li key={`${i}:${w}`}>{w}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {mergeSnapshot.errors && mergeSnapshot.errors.length > 0 ? (
              <>
                <h3>Parse issues (partial import)</h3>
                <ul>
                  {mergeSnapshot.errors.map((err) => (
                    <li key={`${err.fileName}:${err.message}`}>
                      <strong>{err.fileName}</strong>: {err.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <p>No merge results yet. Upload one or more workbooks above.</p>
        )}
      </section>

      <section aria-label="Manual input">
        <h2>Manual KPI</h2>
        <p>
          Macro KPIs are stored in the database for the public dashboard. Values load when
          the upload secret is accepted (or when the server has no secret configured).
          Save with the button below (<code>PUT /api/settings</code>) or include them on
          upload using the checkbox above.
        </p>
        {settingsHint ? <p role="status">{settingsHint}</p> : null}
        <div>
          <label htmlFor="followers-total">Followers (total)</label>
          <input
            id="followers-total"
            name="followers"
            inputMode="numeric"
            value={manual.followersTotal}
            onChange={(e) =>
              setManual((m) => ({ ...m, followersTotal: e.target.value }))
            }
          />
        </div>
        <div>
          <label htmlFor="likes-saves-total">Likes and saves (total)</label>
          <input
            id="likes-saves-total"
            name="likesAndSaves"
            inputMode="numeric"
            value={manual.likesAndSavesTotal}
            onChange={(e) =>
              setManual((m) => ({ ...m, likesAndSavesTotal: e.target.value }))
            }
          />
        </div>
        <div>
          <label htmlFor="total-posts">Total posts</label>
          <input
            id="total-posts"
            name="totalPosts"
            inputMode="numeric"
            value={manual.totalPosts}
            onChange={(e) =>
              setManual((m) => ({ ...m, totalPosts: e.target.value }))
            }
          />
        </div>
        <div>
          <label htmlFor="launch-date">Launch date</label>
          <input
            id="launch-date"
            name="launchDate"
            type="date"
            value={manual.launchDate}
            onChange={(e) =>
              setManual((m) => ({ ...m, launchDate: e.target.value }))
            }
          />
        </div>
        <p>
          <button
            type="button"
            disabled={savingKpi}
            onClick={() => void saveKpis()}
          >
            {savingKpi ? "Saving…" : "Save KPIs"}
          </button>
        </p>
      </section>

      <section aria-label="Post links">
        <h2>Post links</h2>
        <p>
          Filter notes by title keyword and publish date, then paste a post URL for each
          row. Uses <code>GET /api/notes</code> and <code>PATCH /api/notes/:id</code> with
          the same Bearer secret as the rest of this page. Save and Clear feedback for each
          row appears under that row&apos;s URL field.
        </p>
        {notesHint ? <p role="status">{notesHint}</p> : null}
        <div
          style={{
            display: "grid",
            gap: "8px",
            marginBottom: "12px",
            maxWidth: "720px",
          }}
        >
          <div>
            <label htmlFor="notes-q">Title contains</label>
            <input
              id="notes-q"
              type="search"
              value={notesQ}
              onChange={(e) => setNotesQ(e.target.value)}
              placeholder="Keyword in title"
            />
          </div>
          <div>
            <label htmlFor="notes-year">Year</label>
            <input
              id="notes-year"
              name="year"
              inputMode="numeric"
              value={notesYear}
              onChange={(e) => setNotesYear(e.target.value)}
              placeholder="e.g. 2026"
            />
          </div>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <label htmlFor="notes-from">From (YYYY-MM-DD)</label>
              <input
                id="notes-from"
                name="from"
                type="date"
                value={notesFrom}
                onChange={(e) => setNotesFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="notes-to">To (YYYY-MM-DD)</label>
              <input
                id="notes-to"
                name="to"
                type="date"
                value={notesTo}
                onChange={(e) => setNotesTo(e.target.value)}
              />
            </div>
          </div>
          <p>
            <button type="button" onClick={() => applyNotesSearch()}>
              Search
            </button>
          </p>
        </div>

        {notesLoading ? <p>Loading notes…</p> : null}

        {!notesLoading && notesItems.length === 0 && !notesHint ? (
          <p>No notes match the current filters (or the database has no notes yet).</p>
        ) : null}

        {notesItems.length > 0 ? (
          <>
            <p>
              Page {notesPage} of {notesPageCount} ({notesTotal} total).
            </p>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  minWidth: "640px",
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ccc",
                        padding: "6px",
                      }}
                    >
                      Published
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ccc",
                        padding: "6px",
                      }}
                    >
                      Title
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ccc",
                        padding: "6px",
                      }}
                    >
                      Post URL
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #ccc",
                        padding: "6px",
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {notesItems.map((row) => {
                    const rowHint = postLinkRowHint[row.id];
                    const rowHintId = rowHint
                      ? `post-url-feedback-${row.id}`
                      : undefined;
                    const rowHintOk =
                      rowHint === "Post link saved." ||
                      rowHint === "Post link cleared.";
                    return (
                      <tr key={row.id}>
                        <td
                          style={{
                            verticalAlign: "top",
                            padding: "6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.publishedDate}
                        </td>
                        <td style={{ verticalAlign: "top", padding: "6px" }}>
                          {row.title}
                        </td>
                        <td style={{ verticalAlign: "top", padding: "6px" }}>
                          <input
                            id={`post-url-${row.id}`}
                            aria-label={`Post URL for ${row.title.slice(0, 40)}`}
                            aria-describedby={rowHintId}
                            type="text"
                            inputMode="url"
                            autoComplete="off"
                            value={draftUrls[row.id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraftUrls((d) => ({ ...d, [row.id]: v }));
                              setPostLinkRowHint((prev) => {
                                if (!(row.id in prev)) return prev;
                                const next = { ...prev };
                                delete next[row.id];
                                return next;
                              });
                            }}
                            placeholder="https://…"
                            style={{ width: "100%", minWidth: "200px" }}
                            disabled={rowActionId === row.id}
                          />
                          {rowHint ? (
                            <p
                              id={rowHintId}
                              role={rowHintOk ? "status" : "alert"}
                              style={{
                                fontSize: "13px",
                                marginTop: "6px",
                                marginBottom: 0,
                                maxWidth: "420px",
                                color: rowHintOk ? undefined : "#b00020",
                              }}
                            >
                              {rowHint}
                            </p>
                          ) : null}
                          {row.postUrl ? (
                            <div style={{ fontSize: "12px", marginTop: "4px" }}>
                              Saved:{" "}
                              <a
                                href={row.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                open
                              </a>
                            </div>
                          ) : null}
                        </td>
                        <td
                          style={{
                            verticalAlign: "top",
                            padding: "6px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <button
                            type="button"
                            disabled={rowActionId === row.id}
                            onClick={() => void saveNotePostUrl(row.id)}
                          >
                            {rowActionId === row.id ? "…" : "Save"}
                          </button>{" "}
                          <button
                            type="button"
                            disabled={rowActionId === row.id}
                            onClick={() => void clearNotePostUrl(row.id)}
                          >
                            Clear
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p>
              <button
                type="button"
                disabled={notesPage <= 1 || notesLoading}
                onClick={() => setNotesPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>{" "}
              <button
                type="button"
                disabled={notesPage >= notesPageCount || notesLoading}
                onClick={() =>
                  setNotesPage((p) => Math.min(notesPageCount, p + 1))
                }
              >
                Next
              </button>
            </p>
          </>
        ) : null}
      </section>

      <details>
        <summary>Parse preview (debug, not persisted)</summary>
        <section aria-label="Parse debug" style={{ marginTop: "12px" }}>
          <p>
            Calls <code>POST /api/excel/parse</code> per file for raw grid inspection
            only. The main import path is <code>POST /api/upload</code>.
          </p>
          <div>
            <label htmlFor="debug-excel-files">Excel files for parse preview</label>
            <input
              id="debug-excel-files"
              type="file"
              multiple
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={debugLoading}
              onChange={(e) => void onDebugParseSelected(e.target.files)}
            />
          </div>
          {debugLoading ? <p>Parsing…</p> : null}
          {debugError ? (
            <p role="alert">
              Error: {debugError}
            </p>
          ) : null}
          <h3>Merged summary</h3>
          <pre>
            {JSON.stringify(
              debugParsed
                ? debugParsed.mergedSummary
                : { hint: "Choose files above for parse preview only." },
              null,
              2,
            )}
          </pre>
          <h3>Raw workbook structure</h3>
          <p>
            Per sheet: row/column counts, a short preview grid, and a bounded{" "}
            <code>sheetRows</code> sample (see <code>payloadRowsTruncated</code>).
          </p>
          <pre>
            {JSON.stringify(
              debugParsed
                ? {
                    sheetOrder: debugParsed.sheetOrder,
                    sheets: debugParsed.sheets.map((s) => ({
                      name: s.name,
                      rowCount: s.rowCount,
                      colCount: s.colCount,
                      previewGrid: s.previewGrid,
                      sheetRows: s.sheetRows,
                      payloadRowsTruncated: s.payloadRowsTruncated,
                    })),
                  }
                : { hint: "Choose files above for parse preview only." },
              null,
              2,
            )}
          </pre>
        </section>
      </details>

      <section aria-label="Manual KPI snapshot">
        <h2>Form snapshot (reference)</h2>
        <pre>{JSON.stringify(manualSnapshot, null, 2)}</pre>
      </section>
    </main>
  );
}
