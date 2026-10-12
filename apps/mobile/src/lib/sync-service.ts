import NetInfo from "@react-native-community/netinfo";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppState, type NativeEventSubscription } from "react-native";
import {
  LocalStore,
  SupabaseTransport,
  SyncEngine,
  type JsonValue,
  type OutboxProblem,
  type Row,
} from "@leakbook/sync";
import type { KeyValue } from "./database";

export type SyncPhase = "idle" | "syncing" | "offline" | "signed_out" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  pending: number;
  problems: OutboxProblem[];
  lastSyncedAt: number | null;
  /** Set once the first full download for this sign-in has finished. */
  initialSyncDone: boolean;
  error: string | null;
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
  ) {
    this.store = store;
    this.engine = new SyncEngine(store, new SupabaseTransport(supabase));
    this.statusValue = {
      phase: "idle",
      pending: store.pendingCount(),
      problems: store.problems(),
      lastSyncedAt: Number(kv.get("sync:last_synced_at")) || null,
      initialSyncDone: kv.get("sync:initial_done") === "1",
      error: null,
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
    };
    for (const fn of this.listeners) fn();
  }

  private setStatus(patch: Partial<SyncStatus>) {
    this.statusValue = { ...this.statusValue, ...patch };
    for (const fn of this.listeners) fn();
  }

  // ---------------------------------------------------------------------------
  // Local writes
  // ---------------------------------------------------------------------------

  insert(table: string, companyId: string, values: Record<string, JsonValue>): string {
    const id = this.store.insert(table, companyId, values);
    this.afterWrite();
    return id;
  }

  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void {
    this.store.write(table, id, companyId, values);
    this.afterWrite();
  }

  /** Several writes as one unit: all saved or none. */
  batch<T>(fn: () => T): T {
    const result = this.store.database.transaction(fn);
    this.afterWrite();
    return result;
  }

  get<T extends Row>(table: string, id: string): T | undefined {
    return this.store.get<T>(table, id);
  }

  list<T extends Row>(table: string, companyId?: string): T[] {
    return this.store.list<T>(table, companyId ? { companyId } : {});
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
      if (cameBack) this.syncSoon(0);
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
    const summary = await this.engine.sync();
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
    this.setStatus({ phase: "idle", lastSyncedAt: now, initialSyncDone: true, error: null });
    this.emit(summary.pulled > 0 || summary.pushed > 0);
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
    };
    this.emit(true);
  }
}
