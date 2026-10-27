import NetInfo from "@react-native-community/netinfo";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppState, type NativeEventSubscription } from "react-native";
import {
  isConnectionError,
  looksSignedOut,
  syncErrorText,
  uploadRefusal,
  uploadRefusalMessage,
  uuidv7,
} from "@leakbook/core";
import { Paths } from "expo-file-system";
import {
  LocalStore,
  StorageFullError,
  SupabaseTransport,
  SyncEngine,
  UploadQueue,
  type DownloadState,
  type JsonValue,
  type OutboxProblem,
  type Row,
  type Uploader,
  isStorageFull,
} from "@leakbook/sync";
import { API_URL } from "./config";
import type { KeyValue } from "./database";
import { dropAllDrafts } from "./drafts";
import { deleteAllMedia } from "./media";
import { withWaitingSince } from "./syncNote";

export type SyncPhase = "idle" | "syncing" | "offline" | "signed_out" | "error" | "read_only";

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  problems: OutboxProblem[];
  lastSyncedAt: number | null;
  /** Set once the first full download for this sign-in has finished. */
  initialSyncDone: boolean;
  error: string | null;
  /** Captured files not yet in cloud storage. */
  uploads: UploadStatus;
  /** The phone is (nearly) out of storage: new work may not save (M11). */
  storageLow: boolean;
  /**
   * Since when changes or files have been waiting without a break (ms), or null when nothing
   * waits. The sync bar shows "waiting" only after 8 seconds of it (lib/syncNote.ts).
   */
  waitingSince: number | null;
  /**
   * The first download's progress (Getting Ready, gestures spec section 11): rows saved per
   * table and the server's count per table. Null outside the first download.
   */
  download: DownloadState | null;
}

/** Below this much free space the app warns before saves start failing. */
const LOW_STORAGE_BYTES = 200 * 1024 * 1024;

function freeSpaceLow(): boolean {
  try {
    return Paths.availableDiskSpace < LOW_STORAGE_BYTES;
  } catch {
    return false;
  }
}

export interface UploadStatus {
  waiting: number;
  /** True when every waiting file is a photo (for "12 photos waiting to upload"). */
  allPhotos: boolean;
  lastError: string | null;
}

export interface TeamProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

const WRITE_DEBOUNCE_MS = 2_000;
const INTERVAL_MS = 60_000;

/**
 * Owns the local store and decides when to sync: on start, when the app returns to the
 * foreground, when the network comes back, shortly after local edits, and every minute
 * while open. Screens subscribe for data and status changes.
 */
export class SyncService {
  readonly store: LocalStore;
  private readonly engine: SyncEngine;
  private readonly uploadQueue: UploadQueue;
  private listeners = new Set<() => void>();
  private dataVersion = 0;
  private statusValue: SyncStatus;
  private online = true;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private appStateSub: NativeEventSubscription | null = null;
  private netUnsub: (() => void) | null = null;
  /** Bumped by stop(), so a sync still running when the phone signs out is ignored. */
  private epoch = 0;
  /**
   * The server refused this phone's sign-in and a refresh didn't help: the session signs out
   * on this phone and shows Sign In (state/session.tsx).
   */
  onSessionEnded: (() => void) | null = null;

  constructor(
    store: LocalStore,
    private readonly supabase: SupabaseClient,
    private readonly kv: KeyValue,
    uploader: Uploader,
  ) {
    this.store = store;
    this.engine = new SyncEngine(store, new SupabaseTransport(supabase), {
      // The first download reports its progress page by page, and an interrupted one resumes
      // as a first download (big pages, progress).
      onDownload: (download) => {
        if (!this.statusValue.initialSyncDone) this.setStatus({ download });
      },
      firstDownload: () => !this.statusValue.initialSyncDone,
    });
    this.uploadQueue = new UploadQueue(store, uploader);
    this.statusValue = {
      phase: "idle",
      pending: store.pendingCount(),
      problems: store.problems(),
      lastSyncedAt: Number(kv.get("sync:last_synced_at")) || null,
      initialSyncDone: kv.get("sync:initial_done") === "1",
      error: null,
      uploads: this.uploadStatus(),
      storageLow: freeSpaceLow(),
      waitingSince: null,
      download: null,
    };
    this.statusValue = withWaitingSince(this.statusValue, null);
  }

  // ---------------------------------------------------------------------------
  // Subscriptions (useSyncExternalStore)
  // ---------------------------------------------------------------------------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get version(): number {
    return this.dataVersion;
  }

  /** Changes when a row of `table` changes (see LocalStore.tableVersion). */
  tableVersion(table: string): string {
    return this.store.tableVersion(table);
  }

  get status(): SyncStatus {
    return this.statusValue;
  }

  private emit(dataChanged: boolean) {
    if (dataChanged) this.dataVersion += 1;
    this.statusValue = withWaitingSince(
      {
        ...this.statusValue,
        pending: this.store.pendingCount(),
        problems: this.store.problems(),
        uploads: this.uploadStatus(),
        storageLow: freeSpaceLow(),
      },
      this.statusValue,
    );
    for (const fn of this.listeners) fn();
  }

  private uploadStatus(): UploadStatus {
    const rows = this.store.database.all<{ kind: string | null; last_error: string | null }>(
      `select json_extract(r.data, '$.kind') as kind, q.last_error
         from upload_queue q left join sync_records r on r.table_name = 'media' and r.id = q.media_id
        order by q.rowid`,
    );
    return {
      waiting: rows.length,
      allPhotos: rows.every((r) => r.kind === "photo"),
      lastError: rows.find((r) => r.last_error)?.last_error ?? null,
    };
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.statusValue = withWaitingSince({ ...this.statusValue, ...patch }, this.statusValue);
    for (const fn of this.listeners) fn();
  }

  // ---------------------------------------------------------------------------
  // Local writes
  // ---------------------------------------------------------------------------

  insert(table: string, companyId: string, values: Record<string, JsonValue>): string {
    const id = this.guard(() => this.store.insert(table, companyId, values));
    this.afterWrite();
    return id;
  }

  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void {
    this.guard(() => this.store.write(table, id, companyId, values));
    this.afterWrite();
  }

  /** Several writes as one unit: all saved or none. */
  batch<T>(fn: () => T): T {
    const result = this.guard(() => this.store.database.transaction(fn));
    this.afterWrite();
    return result;
  }

  /**
   * Runs a local save. When the phone is out of storage the save rolls back whole and a
   * StorageFullError explains it (the app shows it instead of crashing; see monitoring.ts).
   */
  private guard<T>(save: () => T): T {
    try {
      return save();
    } catch (e) {
      if (!isStorageFull(e)) throw e;
      this.setStatus({ storageLow: true });
      throw new StorageFullError();
    }
  }

  get<T extends Row>(table: string, id: string): T | undefined {
    return this.store.get<T>(table, id);
  }

  /** Rows of a table, optionally for one company and one job (job rows use the job index). */
  list<T extends Row>(
    table: string,
    companyId?: string,
    jobId?: string,
    includeDeleted = false,
  ): T[] {
    return this.store.list<T>(table, { companyId, jobId, includeDeleted });
  }

  /**
   * Save a capture: the media row and its upload ticket in one transaction, so a file is
   * never queued without its row or the other way around.
   */
  addMedia(
    id: string,
    companyId: string,
    values: Record<string, JsonValue>,
    file: { localPath: string; storagePath: string; mimeType: string },
  ) {
    this.guard(() =>
      this.store.database.transaction(() => {
        this.store.write("media", id, companyId, values);
        this.uploadQueue.enqueue({ mediaId: id, companyId, ...file });
      }),
    );
    this.afterWrite();
  }

  /** Save a signature: the row (already holding its storage path) and its upload ticket. */
  addSignature(
    id: string,
    companyId: string,
    values: Record<string, JsonValue>,
    file: { localPath: string; storagePath: string },
  ) {
    this.guard(() =>
      this.store.database.transaction(() => {
        this.store.write("signature", id, companyId, { ...values, device_id: this.store.deviceId });
        this.uploadQueue.enqueue({
          mediaId: id,
          recordTable: "signature",
          companyId,
          localPath: file.localPath,
          storagePath: file.storagePath,
          mimeType: "image/svg+xml",
        });
      }),
    );
    this.afterWrite();
  }

  /** True while local edits to this row (or, without an id, this table) are unsent. */
  hasPendingWrites(table: string, id?: string): boolean {
    const sql =
      "select count(*) as n from sync_outbox where table_name = ? and status = 'pending'" +
      (id ? " and row_id = ?" : "");
    return (this.store.database.get<{ n: number }>(sql, id ? [table, id] : [table])?.n ?? 0) > 0;
  }

  /**
   * True while a file of this job (a photo, video or signature image) is still waiting to
   * upload, so a report sent now would go without it.
   */
  hasPendingUploads(jobId: string): boolean {
    const row = this.store.database.get<{ n: number }>(
      `select count(*) as n from upload_queue q
         join sync_records r on r.table_name = q.record_table and r.id = q.media_id
        where r.job_id = ?`,
      [jobId],
    );
    return (row?.n ?? 0) > 0;
  }

  /** The signed-in user's access token, for calls to the Sundeck Pro server. */
  async accessToken(): Promise<string | null> {
    return (await this.supabase.auth.getSession()).data.session?.access_token ?? null;
  }

  /** Retry waiting uploads now (Settings button). */
  retryUploads() {
    this.uploadQueue.retryNow();
    this.syncSoon(0);
  }

  discardProblem(seq: number) {
    this.store.discardProblem(seq);
    this.emit(true);
    this.syncSoon(0);
  }

  private afterWrite() {
    this.emit(true);
    this.syncSoon(WRITE_DEBOUNCE_MS);
  }

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------

  start() {
    if (this.interval) return;
    this.appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") this.syncSoon(0);
    });
    this.netUnsub = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected) && state.isInternetReachable !== false;
      const cameBack = online && !this.online;
      this.online = online;
      if (!online) this.setStatus({ phase: "offline" });
      if (cameBack) {
        this.uploadQueue.retryNow();
        this.syncSoon(0);
      }
    });
    this.interval = setInterval(() => this.syncSoon(0), INTERVAL_MS);
    this.syncSoon(0);
  }

  stop() {
    this.epoch += 1;
    this.appStateSub?.remove();
    this.netUnsub?.();
    if (this.interval) clearInterval(this.interval);
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.appStateSub = null;
    this.netUnsub = null;
    this.interval = null;
    this.writeTimer = null;
  }

  syncSoon(delayMs: number) {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.syncNow();
    }, delayMs);
  }

  async syncNow(): Promise<void> {
    if (!this.online) {
      this.setStatus({ phase: "offline" });
      return;
    }
    const run = this.epoch;
    const { data, error: sessionError } = await this.supabase.auth.getSession();
    if (run !== this.epoch) return;
    if (!data.session) {
      // Offline with an expired token: the session is kept and refreshes once back online.
      if (sessionError && connectionFailure(sessionError)) {
        this.setStatus({ phase: "offline" });
        return;
      }
      // supabase-js drops a session whose refresh the server refused (owner, 2026-10-22).
      this.setStatus({ phase: "signed_out", error: null });
      this.onSessionEnded?.();
      return;
    }

    this.setStatus({ phase: "syncing", error: null });
    let summary = await this.engine.sync();
    // Stopped meanwhile (signed out): a late answer changes nothing.
    if (run !== this.epoch) return;
    if (summary.authFailed || looksSignedOut(summary.error)) {
      // No valid sign-in reached the server (expired, revoked, or no user token at all, which
      // Postgres answers with "permission denied for function sync_pull"). Try a fresh token
      // once; if the server refuses it, this phone signs out and shows Sign In, keeping its
      // data and unsent changes for the same account (owner, 2026-10-22).
      const refreshed = await this.supabase.auth.refreshSession();
      if (run !== this.epoch) return;
      if (refreshed.error && connectionFailure(refreshed.error)) {
        this.setStatus({ phase: "offline", error: null });
        return;
      }
      if (refreshed.error || !refreshed.data.session) {
        this.setStatus({ phase: "signed_out", error: null });
        this.onSessionEnded?.();
        return;
      }
      summary = await this.engine.sync();
      if (run !== this.epoch) return;
      if (summary.authFailed) {
        this.setStatus({ phase: "signed_out", error: null });
        this.onSessionEnded?.();
        return;
      }
    }
    if (summary.error) {
      const offline = /network|fetch|offline|timed? ?out/i.test(summary.error);
      this.setStatus({
        phase: offline ? "offline" : "error",
        // Plain words only, never the server's message (owner, 2026-10-22).
        error: offline ? null : syncErrorText(summary.error),
      });
      this.emit(summary.pulled > 0);
      return;
    }

    const now = Date.now();
    this.kv.set("sync:last_synced_at", String(now));
    this.kv.set("sync:initial_done", "1");
    await this.refreshTeam();
    this.setStatus({
      // Read-only shop (subscription unpaid): downloads work, changes wait on the phone.
      phase: summary.readOnly ? "read_only" : "idle",
      lastSyncedAt: now,
      initialSyncDone: true,
      error: summary.readOnly ?? null,
      download: null,
    });
    this.emit(summary.pulled > 0 || summary.pushed > 0);
    await this.runUploads();
  }

  /** Upload due files; then push the "uploaded" marks and ask for transcripts. */
  private async runUploads() {
    if (this.uploadQueue.waitingCount() === 0) return;
    const result = await this.uploadQueue.process();
    this.emit(result.uploaded > 0);
    if (result.uploaded === 0) return;
    this.syncSoon(0);
    for (const id of result.uploadedIds) {
      const row = this.store.get("media", id);
      if (row?.kind === "audio") void this.requestTranscript(id);
    }
  }

  /** Ask the server to transcribe a voice note. Best effort; the office can retry. */
  private async requestTranscript(mediaId: string) {
    if (!API_URL) return;
    const { data } = await this.supabase.auth.getSession();
    if (!data.session) return;
    try {
      await fetch(`${API_URL}/api/media/${mediaId}/transcribe`, {
        method: "POST",
        headers: { authorization: `Bearer ${data.session.access_token}` },
      });
      this.syncSoon(0);
    } catch {
      // Offline or server unavailable; the transcript stays "not yet".
    }
  }

  // ---------------------------------------------------------------------------
  // Company texting (owner, 2026-10-16): pictures and my own mobile number. Texts and calls
  // sync as rows; these few calls need a signal.
  // ---------------------------------------------------------------------------

  /** Signed links (an hour) for pictures in texts. */
  async textPictureUrls(paths: string[]): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    if (!paths.length) return urls;
    const { data } = await this.supabase.storage.from("texts").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    return urls;
  }

  /** Put a photo in the shop's texts folder, ready to send. Returns its path. */
  async uploadTextPicture(companyId: string, uri: string, type: string): Promise<string> {
    const ext = type.split("/")[1] ?? "jpeg";
    const path = `${companyId}/out/${uuidv7()}.${ext}`;
    const body = await (await fetch(uri)).arrayBuffer();
    const { error } = await this.supabase.storage
      .from("texts")
      .upload(path, body, { contentType: type });
    if (error) {
      // The bucket's own limits, or a read-only shop (security review M2), in plain words.
      const refusal = uploadRefusal(null, error.message);
      throw new Error(refusal ? uploadRefusalMessage(refusal, "texts") : error.message);
    }
    return path;
  }

  async myPhone(): Promise<string | null> {
    const { data: session } = await this.supabase.auth.getSession();
    const id = session.session?.user.id;
    if (!id) return null;
    const { data } = await this.supabase.from("profile").select("phone").eq("id", id).maybeSingle();
    return (data?.phone as string | null) ?? null;
  }

  async saveMyPhone(phone: string): Promise<void> {
    const { data: session } = await this.supabase.auth.getSession();
    const id = session.session?.user.id;
    if (!id) throw new Error("Sign in again to continue.");
    const { error } = await this.supabase.from("profile").update({ phone }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  // ---------------------------------------------------------------------------
  // Teammates' names (profiles are per user, not synced rows; cached for offline use)
  // ---------------------------------------------------------------------------

  private async refreshTeam() {
    const { data, error } = await this.supabase.from("profile").select("id, full_name, email");
    if (!error && data) this.kv.set("team_profiles", JSON.stringify(data));
  }

  team(): TeamProfile[] {
    try {
      return JSON.parse(this.kv.get("team_profiles") ?? "[]") as TeamProfile[];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // Sign-out
  // ---------------------------------------------------------------------------

  /** Delete this account's data from the device. Call after warning about pending changes. */
  clearLocalData() {
    this.stop();
    this.store.clearAll();
    try {
      deleteAllMedia();
    } catch {
      // Files are inside the app's own folder; a leftover is overwritten by id next time.
    }
    for (const key of [
      "sync:last_synced_at",
      "sync:initial_done",
      "team_profiles",
      "active_company",
      // Reports waiting to send go with the person's data (lib/reportQueue, lib/visitReports).
      "report_request:queue",
      "visit_report:queue",
      "capture:pending",
      // Recent in search: what this person opened (lib/shopSearch RECENT_KEY).
      "search:recent",
      // Shops last seen needing setup (lib/setupGate SETUP_NEEDED_KEY).
      "access:setup_needed",
    ]) {
      this.kv.remove(key);
    }
    // Typed text not saved yet goes too (lib/drafts).
    dropAllDrafts(this.kv);
    this.statusValue = {
      phase: "signed_out",
      pending: 0,
      problems: [],
      lastSyncedAt: null,
      initialSyncDone: false,
      error: null,
      uploads: { waiting: 0, allPhotos: true, lastError: null },
      storageLow: false,
      waitingSince: null,
      download: null,
    };
    this.emit(true);
  }
}

/** A refresh or session read that failed only for want of a connection (try again later). */
function connectionFailure(error: { name?: string; message?: string; status?: number }): boolean {
  return (
    error.name === "AuthRetryableFetchError" ||
    error.name === "AuthRefreshDiscardedError" ||
    (error.status ?? 0) >= 500 ||
    isConnectionError(error.message)
  );
}
