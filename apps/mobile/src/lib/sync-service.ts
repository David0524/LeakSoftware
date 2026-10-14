import NetInfo from "@react-native-community/netinfo";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppState, type NativeEventSubscription } from "react-native";
import { Paths } from "expo-file-system";
import {
  LocalStore,
  StorageFullError,
  SupabaseTransport,
  SyncEngine,
  UploadQueue,
  type JsonValue,
  type OutboxProblem,
  type Row,
  type Uploader,
  isStorageFull,
} from "@leakbook/sync";
import { API_URL } from "./config";
import type { KeyValue } from "./database";
import { deleteAllMedia } from "./media";

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

  constructor(
    store: LocalStore,
    private readonly supabase: SupabaseClient,
    private readonly kv: KeyValue,
    uploader: Uploader,
  ) {
    this.store = store;
    this.engine = new SyncEngine(store, new SupabaseTransport(supabase));
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
    };
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

  get status(): SyncStatus {
    return this.statusValue;
  }

  private emit(dataChanged: boolean) {
    if (dataChanged) this.dataVersion += 1;
    this.statusValue = {
      ...this.statusValue,
      pending: this.store.pendingCount(),
      problems: this.store.problems(),
      uploads: this.uploadStatus(),
      storageLow: freeSpaceLow(),
    };
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
    this.statusValue = { ...this.statusValue, ...patch };
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
  list<T extends Row>(table: string, companyId?: string, jobId?: string): T[] {
    return this.store.list<T>(table, { companyId, jobId });
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

  /** The signed-in user's access token, for calls to the Tidemark server. */
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
    const { data } = await this.supabase.auth.getSession();
    if (!data.session) {
      this.setStatus({ phase: "signed_out" });
      return;
    }

    this.setStatus({ phase: "syncing", error: null });
    let summary = await this.engine.sync();
    if (summary.authFailed) {
      // The saved sign-in was refused (expired or revoked). Try a fresh token once; if that
      // fails too, ask the tech to sign in again. Everything stays on the phone meanwhile.
      const refreshed = await this.supabase.auth.refreshSession();
      if (refreshed.error || !refreshed.data.session) {
        this.setStatus({ phase: "signed_out", error: null });
        return;
      }
      summary = await this.engine.sync();
    }
    if (summary.error) {
      const offline = /network|fetch|offline|timed? ?out/i.test(summary.error);
      this.setStatus({
        phase: offline ? "offline" : "error",
        error: offline ? null : summary.error,
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
    ]) {
      this.kv.remove(key);
    }
    this.statusValue = {
      phase: "signed_out",
      pending: 0,
      problems: [],
      lastSyncedAt: null,
      initialSyncDone: false,
      error: null,
      uploads: { waiting: 0, allPhotos: true, lastError: null },
      storageLow: false,
    };
    this.emit(true);
  }
}
