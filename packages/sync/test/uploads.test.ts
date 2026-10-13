import { describe, expect, it } from "vitest";
import { LocalStore, UploadQueue, type UploadJob, type Uploader } from "../src";
import { memoryDb } from "./sqlite";

const C = "00000000-0000-4000-8000-0000000000c1";

function setup() {
  let now = 1_000_000;
  const store = LocalStore.open(memoryDb(), { now: () => now });
  const calls: UploadJob[] = [];
  let failures = 0;
  const uploader: Uploader & { failures: number } = {
    get failures() {
      return failures;
    },
    set failures(n) {
      failures = n;
    },
    async upload(job: UploadJob, saveResumeUrl: (url: string | null) => void) {
      calls.push(job);
      if (failures > 0) {
        saveResumeUrl(`https://tus/${job.mediaId}`);
        failures -= 1;
        throw new Error("timeout");
      }
      return "uploaded";
    },
  };
  const queue = new UploadQueue(store, uploader, () => now);
  const mediaId = store.insert("media", C, { job_id: "j", kind: "photo", upload_state: "pending" });
  const job = {
    mediaId,
    companyId: C,
    localPath: "/x.jpg",
    storagePath: `${C}/j/${mediaId}.jpg`,
    mimeType: "image/jpeg",
  };
  return { store, queue, uploader, calls, job, advance: (ms: number) => (now += ms) };
}

describe("UploadQueue", () => {
  it("uploads and marks the media row uploaded through sync", async () => {
    const { store, queue, job } = setup();
    queue.enqueue(job);
    queue.enqueue(job);
    expect(queue.waitingCount()).toBe(1);
    expect(await queue.process()).toEqual({
      uploaded: 1,
      uploadedIds: [job.mediaId],
      failed: 0,
      waiting: 0,
    });
    expect(store.get("media", job.mediaId)).toMatchObject({
      upload_state: "uploaded",
      storage_path: job.storagePath,
    });
    expect(store.pendingBatch(10).mutations[0]!.fields.upload_state!.v).toBe("uploaded");
  });

  it("backs off after a failure and retries later", async () => {
    const { queue, uploader, calls, job, advance } = setup();
    queue.enqueue(job);
    uploader.failures = 1;
    expect(await queue.process()).toMatchObject({ failed: 1, waiting: 1 });
    expect(await queue.process()).toMatchObject({ uploaded: 0, failed: 0, waiting: 1 });
    advance(30_000);
    expect(await queue.process()).toMatchObject({ uploaded: 1, waiting: 0 });
    expect(calls).toHaveLength(2);
    // The second attempt resumes the upload the first one started.
    expect(calls.map((c) => c.resumeUrl)).toEqual([null, `https://tus/${job.mediaId}`]);
  });

  it("lists waiting files with their last error and retries on demand", async () => {
    const { queue, uploader, job } = setup();
    queue.enqueue(job);
    uploader.failures = 1;
    await queue.process();
    expect(queue.waiting()).toEqual([{ mediaId: job.mediaId, attempts: 1, lastError: "timeout" }]);
    queue.retryNow();
    expect(await queue.process()).toMatchObject({ uploaded: 1, waiting: 0 });
  });

  it("adds the resume column to a version 1 queue", () => {
    const db = memoryDb();
    db.run(`create table upload_queue (
      media_id text primary key, company_id text not null, local_path text not null,
      storage_path text not null, mime_type text not null,
      attempts integer not null default 0, next_attempt_at integer not null default 0,
      last_error text)`);
    LocalStore.open(db);
    LocalStore.open(db);
    const cols = db.all<{ name: string }>("pragma table_info(upload_queue)").map((c) => c.name);
    expect(cols).toContain("resume_url");
    expect(cols).toContain("record_table");
  });

  it("uploads a signature image without touching any media row", async () => {
    const { store, queue, calls } = setup();
    const before = store.pendingCount();
    queue.enqueue({
      mediaId: "sig-1",
      recordTable: "signature",
      companyId: C,
      localPath: "/sig-1.svg",
      storagePath: `${C}/j/signature-sig-1.svg`,
      mimeType: "image/svg+xml",
    });
    expect(await queue.process()).toEqual({ uploaded: 1, uploadedIds: [], failed: 0, waiting: 0 });
    expect(calls[0]).toMatchObject({ recordTable: "signature", mimeType: "image/svg+xml" });
    expect(store.pendingCount()).toBe(before);
  });
});
