import { describe, expect, it } from "vitest";
import { LocalStore, UploadQueue, type UploadJob, type Uploader } from "../src";
import { memoryDb } from "./sqlite";

const C = "00000000-0000-4000-8000-0000000000c1";

function setup() {
  let now = 1_000_000;
  const store = LocalStore.open(memoryDb(), { now: () => now });
  const calls: string[] = [];
  let failures = 0;
  const uploader: Uploader & { failures: number } = {
    get failures() {
      return failures;
    },
    set failures(n) {
      failures = n;
    },
    async upload(job: UploadJob) {
      calls.push(job.mediaId);
      if (failures > 0) {
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
    expect(await queue.process()).toEqual({ uploaded: 1, failed: 0, waiting: 0 });
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
  });
});
