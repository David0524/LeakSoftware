import type { LocalStore } from "./store";
import type { SyncTransport } from "./types";

export interface SyncSummary {
  pushed: number;
  rejected: number;
  pulled: number;
  pending: number;
  error?: string;
}

export interface SyncEngineOptions {
  /** Mutations per sync_push call (server limit 500). */
  pushBatch?: number;
  /** Rows per sync_pull page. */
  pullPage?: number;
}

/**
 * Push local changes, then pull server changes. Only one sync runs at a time; calling
 * sync() while one is running returns the running one. Failures never lose local data:
 * unsent changes stay in the outbox and the next sync retries them.
 */
export class SyncEngine {
  private running: Promise<SyncSummary> | null = null;
  private readonly pushBatch: number;
  private readonly pullPage: number;

  constructor(
    private readonly store: LocalStore,
    private readonly transport: SyncTransport,
    opts: SyncEngineOptions = {},
  ) {
    this.pushBatch = Math.min(opts.pushBatch ?? 200, 500);
    this.pullPage = opts.pullPage ?? 500;
  }

  sync(): Promise<SyncSummary> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<SyncSummary> {
    const summary: SyncSummary = { pushed: 0, rejected: 0, pulled: 0, pending: 0 };
    try {
      await this.push(summary);
      await this.pull(summary);
    } catch (e) {
      summary.error = e instanceof Error ? e.message : String(e);
    }
    summary.pending = this.store.pendingCount();
    return summary;
  }

  private async push(summary: SyncSummary): Promise<void> {
    for (;;) {
      const batch = this.store.pendingBatch(this.pushBatch);
      if (batch.mutations.length === 0) return;
      const allSeqs = [...batch.seqsByMutation.values()].flat();

      let response;
      try {
        response = await this.transport.push(batch.mutations, this.store.deviceId);
      } catch (e) {
        this.store.noteFailure(allSeqs, e instanceof Error ? e.message : String(e));
        throw e;
      }

      this.store.receiveClock(response.server_hlc);
      const handled = new Set<string>();
      for (const r of response.results) {
        const seqs = batch.seqsByMutation.get(r.id) ?? [];
        handled.add(r.id);
        if (r.status === "rejected") {
          this.store.reject(seqs, `${r.code ?? ""} ${r.error ?? "rejected"}`.trim());
          summary.rejected += 1;
        } else {
          this.store.acknowledge(seqs);
          summary.pushed += 1;
        }
      }
      // A response that skipped mutations would loop forever; treat it as a failure.
      const missing = batch.mutations.filter((m) => !handled.has(m.id));
      if (missing.length > 0) {
        const seqs = missing.flatMap((m) => batch.seqsByMutation.get(m.id) ?? []);
        this.store.noteFailure(seqs, "no result from server");
        throw new Error(`Server returned no result for ${missing.length} change(s)`);
      }
    }
  }

  private async pull(summary: SyncSummary): Promise<void> {
    let cursor = this.store.getCursor();
    for (;;) {
      const page = await this.transport.pull(cursor, this.pullPage);
      this.store.applyPage(page);
      summary.pulled += page.rows.length;
      cursor = page.cursor;
      if (page.done) return;
    }
  }
}
