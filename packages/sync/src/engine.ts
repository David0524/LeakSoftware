import { AuthError } from "./errors";
import type { LocalStore } from "./store";
import type { PullCursor, SyncTransport } from "./types";
import { jobOnPhones, PHONE_HISTORY_MARGIN_DAYS } from "@leakbook/core";

export interface SyncSummary {
  pushed: number;
  rejected: number;
  pulled: number;
  pending: number;
  error?: string;
  /**
   * The shop is read-only (its Sundeck Pro subscription isn't paid): changes stay on the device,
   * unsent, and go up once it is paid. Downloads continue.
   */
  readOnly?: string;
  /**
   * The server no longer accepts this sign-in (expired or revoked). Nothing is lost: changes
   * stay in the outbox until the user signs in again.
   */
  authFailed?: boolean;
}

/** Server code for "this shop is read-only" (supabase/migrations/20261012002100_billing.sql). */
export const READ_ONLY_CODE = "TL423";

/**
 * The first download's progress (owner, 2026-10-20: "Downloading your company takes a long time.
 * Give a more interesting loading bar."): rows applied per table, and the server's count per
 * table (null when it couldn't say). Core downloadProgress turns it into the screen's numbers.
 */
export interface DownloadState {
  pulled: Record<string, number>;
  totals: Record<string, number> | null;
}

/** Rows per page on a first download: the most sync_pull allows. */
export const FIRST_PULL_PAGE = 2000;

export interface SyncEngineOptions {
  /** Mutations per sync_push call (server limit 500). */
  pushBatch?: number;
  /** Rows per sync_pull page. */
  pullPage?: number;
  /** Rows per sync_pull page on a first download (no cursor yet, or a scope restart). */
  firstPullPage?: number;
  /**
   * A first download's progress: once when it starts (after the count), then after each page is
   * saved. Not called for an ordinary pull.
   */
  onDownload?: (state: DownloadState) => void;
  /**
   * Whether the device still counts as on its first download though a cursor is stored (the
   * app's first download was interrupted part way, so it resumes with progress and big pages).
   */
  firstDownload?: () => boolean;
  /** The clock, for which jobs have aged off phones (tests set it). */
  now?: () => Date;
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
  private readonly firstPullPage: number;
  private readonly onDownload: ((state: DownloadState) => void) | undefined;
  private readonly firstDownload: (() => boolean) | undefined;
  private readonly now: () => Date;

  constructor(
    private readonly store: LocalStore,
    private readonly transport: SyncTransport,
    opts: SyncEngineOptions = {},
  ) {
    this.pushBatch = Math.min(opts.pushBatch ?? 200, 500);
    this.pullPage = opts.pullPage ?? 500;
    this.firstPullPage = Math.min(opts.firstPullPage ?? FIRST_PULL_PAGE, FIRST_PULL_PAGE);
    this.onDownload = opts.onDownload;
    this.firstDownload = opts.firstDownload;
    this.now = opts.now ?? (() => new Date());
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
      if (e instanceof AuthError) summary.authFailed = true;
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
      const held: number[] = [];
      for (const r of response.results) {
        const seqs = batch.seqsByMutation.get(r.id) ?? [];
        handled.add(r.id);
        if (r.status === "rejected" && r.code === READ_ONLY_CODE) {
          held.push(...seqs);
          summary.readOnly = r.error ?? "This shop is read-only.";
        } else if (r.status === "rejected") {
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
      // Read-only: keep these for later (not a conflict) and stop pushing for now.
      if (held.length > 0) {
        this.store.noteFailure(held, summary.readOnly!);
        return;
      }
    }
  }

  private async pull(summary: SyncSummary): Promise<void> {
    // When what this user may see has changed, start from the beginning and keep only what
    // comes back: newly visible jobs arrive whole, and jobs taken away leave the device.
    const scope = this.transport.scope ? await this.transport.scope() : null;
    const last = this.store.getScope();
    const restart = scope !== null && last !== null && scope !== last;
    const seen = restart ? new Set<string>() : null;
    const cursor = restart ? {} : this.store.getCursor();
    // A first download (nothing stored yet, or a scope restart): bigger pages, and progress
    // against the server's count.
    const first = restart || isEmptyCursor(cursor) || (this.firstDownload?.() ?? false);
    const pageSize = first ? this.firstPullPage : this.pullPage;
    let download: DownloadState | null = null;
    if (first && this.onDownload) {
      const totals = this.transport.count ? await this.transport.count().catch(() => null) : null;
      download = { pulled: {}, totals };
      this.onDownload({ pulled: {}, totals });
    }
    // The next page is asked for as soon as a page arrives, while that page is being saved:
    // each request needs only the cursor the page before returned, so the order holds.
    let next = this.transport.pull(cursor, pageSize);
    for (;;) {
      const page = await next;
      const ahead = page.done ? null : this.transport.pull(page.cursor, pageSize);
      // Saving can fail; a failed request ahead is then not worth reporting.
      ahead?.catch(() => undefined);
      this.store.applyPage(page);
      if (seen) for (const r of page.rows) seen.add(`${r.table}:${r.row.id}`);
      summary.pulled += page.rows.length;
      if (download) {
        for (const r of page.rows) download.pulled[r.table] = (download.pulled[r.table] ?? 0) + 1;
        this.onDownload?.({ pulled: { ...download.pulled }, totals: download.totals });
      }
      if (!ahead) break;
      next = ahead;
    }
    // Only after a complete pull: an interrupted one starts over next time.
    if (seen) this.store.keepOnly(seen);
    if (scope !== null) this.store.setScope(scope);
    // Finished jobs leave the phone a week after the server stops sending them.
    const now = this.now();
    this.store.pruneJobs((job) =>
      jobOnPhones(
        job as unknown as Parameters<typeof jobOnPhones>[0],
        now,
        PHONE_HISTORY_MARGIN_DAYS,
      ),
    );
  }
}

/** No pull has finished on this device yet. */
function isEmptyCursor(c: PullCursor): boolean {
  return !c.from && !c.high && !c.after;
}
