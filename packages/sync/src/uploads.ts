import type { LocalStore } from "./store";

export interface UploadJob {
  mediaId: string;
  companyId: string;
  localPath: string;
  /** media/{company_id}/{job_id}/{media_id}.{ext} without the bucket name. */
  storagePath: string;
  mimeType: string;
}

/**
 * Uploads one file. "exists" means the object was already there (an earlier attempt
 * finished but the app died before recording it); that counts as success.
 */
export interface Uploader {
  upload(job: UploadJob): Promise<"uploaded" | "exists">;
}

export interface UploadSummary {
  uploaded: number;
  failed: number;
  waiting: number;
}

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 60 * 60_000;

/**
 * Background media upload queue (BUILD_PLAN 4.5). Files stay on the device until the
 * upload is confirmed; the media row is then marked uploaded through normal sync.
 */
export class UploadQueue {
  private running: Promise<UploadSummary> | null = null;

  constructor(
    private readonly store: LocalStore,
    private readonly uploader: Uploader,
    private readonly now: () => number = Date.now,
  ) {}

  /** Add a file. Safe to call twice for the same media id. */
  enqueue(job: UploadJob): void {
    this.store.database.run(
      `insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type)
       values (?, ?, ?, ?, ?) on conflict (media_id) do nothing`,
      [job.mediaId, job.companyId, job.localPath, job.storagePath, job.mimeType],
    );
  }

  waitingCount(): number {
    return this.store.database.get<{ n: number }>("select count(*) as n from upload_queue")?.n ?? 0;
  }

  /** Upload everything that is due. One run at a time. */
  process(): Promise<UploadSummary> {
    this.running ??= this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<UploadSummary> {
    const due = this.store.database.all<{
      media_id: string;
      company_id: string;
      local_path: string;
      storage_path: string;
      mime_type: string;
      attempts: number;
    }>("select * from upload_queue where next_attempt_at <= ? order by rowid", [this.now()]);

    let uploaded = 0;
    let failed = 0;
    for (const row of due) {
      const job: UploadJob = {
        mediaId: row.media_id,
        companyId: row.company_id,
        localPath: row.local_path,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
      };
      try {
        await this.uploader.upload(job);
        this.store.database.transaction(() => {
          this.store.write("media", job.mediaId, job.companyId, {
            upload_state: "uploaded",
            storage_path: job.storagePath,
          });
          this.store.database.run("delete from upload_queue where media_id = ?", [job.mediaId]);
        });
        uploaded += 1;
      } catch (e) {
        const delay = Math.min(BASE_DELAY_MS * 2 ** row.attempts, MAX_DELAY_MS);
        this.store.database.run(
          "update upload_queue set attempts = attempts + 1, next_attempt_at = ?, last_error = ? where media_id = ?",
          [this.now() + delay, e instanceof Error ? e.message : String(e), job.mediaId],
        );
        failed += 1;
      }
    }
    return { uploaded, failed, waiting: this.waitingCount() };
  }
}
