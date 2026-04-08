"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeWorkbookParseResults } from "@/lib/excel/workbookMerge";
import type { WorkbookParseResult } from "@/lib/excel/workbookTypes";
import { parseWorkbookPreview } from "@/lib/upload/debugClient";
import { fetchSettings, saveSettings, type SettingsResponse } from "@/lib/upload/settingsClient";
import { mapWithConcurrency } from "@/lib/upload/async";
import {
  shouldPollUploadJob,
  type ClientUploadJobStatusResponse,
  type UploadMergeSnapshot,
} from "@/lib/upload/clientStatus";
import {
  fetchNotesList,
  patchNotePostUrl,
  type NoteListItem,
} from "@/lib/upload/notesClient";
import { buildUploadBlobPath } from "@/lib/upload/progress";
import {
  fetchUploadStatus,
  kickoffUpload,
  type QueuedUploadJob,
} from "@/lib/upload/uploadClient";

const NOTES_PAGE_SIZE = 20;

type ManualKpi = {
  followersTotal: string;
  likesAndSavesTotal: string;
  totalPosts: string;
  launchDate: string;
};

const emptyManual: ManualKpi = {
  followersTotal: "",
  likesAndSavesTotal: "",
  totalPosts: "",
  launchDate: "",
};

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
      void (async () => {
        try {
          const result = await fetchSettings(secret);

          if (seq !== loadSeq.current) return;

          if (!result.ok) {
            if (result.status === 401 && secret) {
              setSettingsHint("Could not load saved KPIs. Check the upload secret.");
            } else if (result.status === 401 && !secret) {
              setSettingsHint(
                "Enter the upload secret to load saved KPIs from the server.",
              );
            } else {
              setSettingsHint(result.error);
            }
            return;
          }

          setSettingsHint(null);
          applySettingsToForm(result.data);
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
    try {
      if (seq !== notesLoadSeq.current) {
        return;
      }

      const result = await fetchNotesList(secret, {
        q: filters.q,
        year: filters.year,
        from: filters.from,
        to: filters.to,
        page,
        limit: NOTES_PAGE_SIZE,
      });
      if (seq !== notesLoadSeq.current) {
        return;
      }
      if (!result.ok) {
        if (result.status === 401 && secret) {
          setNotesHint("Unauthorized. Check the upload secret.");
        } else if (result.status === 401 && !secret) {
          setNotesHint("Enter the upload secret to load notes for Post links.");
        } else {
          setNotesHint(result.error);
        }
        setNotesItems([]);
        setNotesTotal(0);
        setDraftUrls({});
        setPostLinkRowHint({});
        return;
      }

      setNotesItems(result.data.items);
      setNotesTotal(result.data.total);
      setDraftUrls(
        Object.fromEntries(
          result.data.items.map((item) => [item.id, item.postUrl ?? ""]),
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
  }, [uploadSecret, appliedNotesFilters, notesPage]);

  useEffect(() => {
    if (!queuedUploadJob) return;

    let cancelled = false;
    let timer: number | null = null;
    const secret = uploadSecret.trim();

    const refreshAfterCompletion = async (status: ClientUploadJobStatusResponse) => {
      if (completedUploadJobIdRef.current === status.jobId) return;
      completedUploadJobIdRef.current = status.jobId;

      if (status.result?.kpiSaved) {
        const refreshed = await fetchSettings(secret).catch(() => null);
        if (!cancelled && refreshed?.ok) {
          applySettingsToForm(refreshed.data);
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
        if (cancelled) return;

        const result = await fetchUploadStatus(secret, queuedUploadJob.jobId);

        if (!result.ok && result.status === 401) {
          setUploadError("Unauthorized. Check the upload secret.");
          return;
        }

        if (!result.ok) {
          if (result.status >= 500) {
            setUploadError(`${result.error}. Retrying…`);
            schedulePoll(2000);
            return;
          }

          setUploadError(result.error);
          return;
        }

        const parsed = result.data;

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

      const kickoff = await kickoffUpload(secret, kickoffPayload);
      if (!kickoff.ok && kickoff.status === 401) {
        setUploadError("Unauthorized. Check the upload secret.");
        return;
      }

      if (!kickoff.ok) {
        setUploadError(kickoff.error);
        return;
      }

      const queued = kickoff.data;
      setQueuedUploadJob(queued);

      if (queued.kpiSaved) {
        const refreshed = await fetchSettings(secret).catch(() => null);
        if (refreshed?.ok) applySettingsToForm(refreshed.data);
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

    try {
      const parts: { fileName: string; result: WorkbookParseResult }[] = [];

      for (const file of files) {
        const parsed = await parseWorkbookPreview(secret, file);
        if (!parsed.ok) {
          const msg =
            parsed.status === 401
              ? "Unauthorized. Check the upload secret."
              : parsed.error;
          setDebugError(`${file.name}: ${msg}`);
          return;
        }

        parts.push({ fileName: file.name, result: parsed.data });
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
      const result = await saveSettings(secret, {
        followers,
        totalPosts,
        likesAndSaves,
        launchDate,
      });

      if (!result.ok) {
        setSettingsHint(
          result.status === 401 ? "Unauthorized. Check the upload secret." : result.error,
        );
        return;
      }
      applySettingsToForm(result.data);
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
    try {
      const result = await patchNotePostUrl(uploadSecret.trim(), noteId, draft);
      if (!result.ok && result.status === 401) {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: "Unauthorized. Check the upload secret.",
        }));
        return;
      }
      if (!result.ok) {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: result.error ?? "Save failed.",
        }));
        return;
      }
      notesLoadSeq.current += 1;
      setNotesItems((rows) =>
        rows.map((r) => (r.id === noteId ? { ...r, postUrl: result.postUrl ?? null } : r)),
      );
      setDraftUrls((d) => ({ ...d, [noteId]: result.postUrl ?? "" }));
      setNotesLoading(false);
      setPostLinkRowHint((prev) => ({
        ...prev,
        [noteId]: "Post link saved.",
      }));
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
    try {
      const result = await patchNotePostUrl(uploadSecret.trim(), noteId, null);
      if (!result.ok && result.status === 401) {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: "Unauthorized. Check the upload secret.",
        }));
        return;
      }
      if (!result.ok) {
        setPostLinkRowHint((prev) => ({
          ...prev,
          [noteId]: result.error ?? "Clear failed.",
        }));
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
    <main className="upload-page">
      <h1>Upload</h1>

      <section className="upload-section" aria-label="Upload and merge">
        <h2>Import workbooks</h2>
        <p>
          Select one or more official export files (.xlsx). Files upload to Blob first,
          then <code>POST /api/upload</code> queues a background workflow that parses and
          writes them to the database. Hold Ctrl (Windows) or Command (macOS) to pick
          multiple files.
        </p>
        <div className="upload-field">
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
        <div className="upload-field">
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
          className="upload-dropzone"
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

      <section className="upload-section" aria-label="Merge preview">
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

      <section className="upload-section" aria-label="Manual input">
        <h2>Manual KPI</h2>
        <p>
          Macro KPIs are stored in the database for the public dashboard. Values load when
          the upload secret is accepted (or when the server has no secret configured).
          Save with the button below (<code>PUT /api/settings</code>) or include them on
          upload using the checkbox above.
        </p>
        {settingsHint ? <p role="status">{settingsHint}</p> : null}
        <div className="upload-field">
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
        <div className="upload-field">
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
        <div className="upload-field">
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
        <div className="upload-field">
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

      <section className="upload-section" aria-label="Post links">
        <h2>Post links</h2>
        <p>
          Filter notes by title keyword and publish date, then paste a post URL for each
          row. Uses <code>GET /api/notes</code> and <code>PATCH /api/notes/:id</code> with
          the same Bearer secret as the rest of this page. Save and Clear feedback for each
          row appears under that row&apos;s URL field.
        </p>
        {notesHint ? <p role="status">{notesHint}</p> : null}
        <div className="upload-filters">
          <div className="upload-field">
            <label htmlFor="notes-q">Title contains</label>
            <input
              id="notes-q"
              type="search"
              value={notesQ}
              onChange={(e) => setNotesQ(e.target.value)}
              placeholder="Keyword in title"
            />
          </div>
          <div className="upload-field">
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
          <div className="upload-inline-fields">
            <div className="upload-field">
              <label htmlFor="notes-from">From (YYYY-MM-DD)</label>
              <input
                id="notes-from"
                name="from"
                type="date"
                value={notesFrom}
                onChange={(e) => setNotesFrom(e.target.value)}
              />
            </div>
            <div className="upload-field">
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
            <div className="upload-table-wrap">
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

      <details className="upload-section upload-debug">
        <summary>Parse preview (debug, not persisted)</summary>
        <section aria-label="Parse debug">
          <p>
            Calls <code>POST /api/excel/parse</code> per file for raw grid inspection
            only. The main import path is <code>POST /api/upload</code>.
          </p>
          <div className="upload-field">
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

      <section className="upload-section" aria-label="Manual KPI snapshot">
        <h2>Form snapshot (reference)</h2>
        <pre>{JSON.stringify(manualSnapshot, null, 2)}</pre>
      </section>
    </main>
  );
}
