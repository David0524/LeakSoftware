import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { mediaStoragePath } from "@leakbook/core";
import {
  LocalStore,
  SupabaseTransport,
  SyncEngine,
  TusUploader,
  UploadQueue,
  type FileSource,
} from "../../src";
import { memoryDb } from "../sqlite";

const config = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../config/supabase-dev.json"), "utf8"),
) as { url: string; publishableKey: string };

const MB = 1024 * 1024;

/**
 * M5 done-test against real Supabase Storage: 30 photos and 2 videos captured offline
 * upload after reconnecting, with the app killed mid-upload, and nothing is duplicated.
 * Each run leaves about 16 MB in the dev project's media bucket (originals are never
 * deletable by app users).
 */
describe("hosted media uploads", () => {
  it("uploads 30 photos and 2 videos captured offline, surviving a kill", async () => {
    const client = createClient(config.url, config.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({
      email: "tech@demo.leakbook.test",
      password: "leakbook-demo",
    });
    if (error) throw error;
    const token = async () => (await client.auth.getSession()).data.session?.access_token ?? null;

    const db = memoryDb();
    const store = LocalStore.open(db, { deviceId: "hostedMedia" });
    const engine = new SyncEngine(store, new SupabaseTransport(client));
    expect((await engine.sync()).error).toBeUndefined();
    const company = store.list("company")[0]!;

    // A job to attach everything to.
    const job = store.database.transaction(() => {
      const cust = store.insert("customer", company.id, { name: "Hosted media test" });
      const prop = store.insert("property", company.id, {
        customer_id: cust,
        address_line1: "5 Upload Ave",
      });
      return store.insert("job", company.id, {
        property_id: prop,
        bill_to_customer_id: cust,
        status: "in_progress",
      });
    });

    // ---- Captured offline: files on "disk" plus media rows and queue entries ----
    const disk = new Map<string, Uint8Array<ArrayBuffer>>();
    const files: FileSource = {
      size: async (p) => disk.get(p)!.length,
      read: async (p, offset, length) => disk.get(p)!.slice(offset, offset + length),
    };
    const offlineQueue = new UploadQueue(
      store,
      new TusUploader({
        supabaseUrl: config.url,
        apiKey: config.publishableKey,
        accessToken: token,
        files,
        fetch: async () => {
          throw new TypeError("Network request failed");
        },
      }),
    );
    const captured: { id: string; path: string; sha: string; kind: string }[] = [];
    for (let i = 0; i < 32; i++) {
      const video = i >= 30;
      const mime = video ? "video/mp4" : "image/jpeg";
      // Videos span two 6 MB chunks so the kill lands between chunks.
      const data = new Uint8Array(randomBytes(video ? 7 * MB : 256 * 1024));
      const sha = createHash("sha256").update(data).digest("hex");
      const id = store.insert("media", company.id, {
        job_id: job,
        kind: video ? "video" : "photo",
        mime_type: mime,
        size_bytes: data.length,
        sha256: sha,
        captured_at: new Date().toISOString(),
        upload_state: "pending",
      });
      const path = mediaStoragePath(company.id, job, id, mime);
      disk.set(`/local/${id}`, data);
      offlineQueue.enqueue({
        mediaId: id,
        companyId: company.id,
        localPath: `/local/${id}`,
        storagePath: path,
        mimeType: mime,
      });
      captured.push({ id, path, sha, kind: video ? "video" : "photo" });
    }
    expect(await offlineQueue.process()).toMatchObject({ uploaded: 0, failed: 32, waiting: 32 });
    expect((await engine.sync()).rejected).toBe(0); // rows reach the server before files

    // ---- Reconnect; the app is killed after the first video's first chunk ----
    const firstVideo = captured[30]!;
    let killed = false;
    const killingFetch: typeof fetch = async (input, init) => {
      if (killed) throw new Error("app killed");
      const res = await fetch(input, init);
      if (
        init?.method === "PATCH" &&
        Number(new Headers(init.headers).get("upload-offset")) === 0
      ) {
        const url = String(input);
        const row = db.get<{ media_id: string }>(
          "select media_id from upload_queue where resume_url = ?",
          [url],
        );
        if (row?.media_id === firstVideo.id) killed = true;
      }
      return res;
    };
    const beforeKill = new UploadQueue(
      store,
      new TusUploader({
        supabaseUrl: config.url,
        apiKey: config.publishableKey,
        accessToken: token,
        files,
        fetch: killingFetch,
      }),
    );
    beforeKill.retryNow();
    const partial = await beforeKill.process();
    expect(partial.uploaded).toBe(30);
    expect(partial.waiting).toBe(2);
    const saved = db.get<{ resume_url: string | null }>(
      "select resume_url from upload_queue where media_id = ?",
      [firstVideo.id],
    );
    expect(saved?.resume_url).toMatch(/upload\/resumable\//);

    // One photo finished on the server, but the app died before recording it.
    const photo = captured[0]!;
    db.run(
      "insert into upload_queue (media_id, company_id, local_path, storage_path, mime_type) values (?, ?, ?, ?, ?)",
      [photo.id, company.id, `/local/${photo.id}`, photo.path, "image/jpeg"],
    );

    // ---- Relaunch: a fresh store, queue, and uploader over the same database ----
    const relaunched = LocalStore.open(db);
    const queue = new UploadQueue(
      relaunched,
      new TusUploader({
        supabaseUrl: config.url,
        apiKey: config.publishableKey,
        accessToken: token,
        files,
      }),
    );
    queue.retryNow();
    const done = await queue.process();
    expect(done, JSON.stringify(queue.waiting())).toMatchObject({ uploaded: 3, waiting: 0 });

    const engine2 = new SyncEngine(relaunched, new SupabaseTransport(client));
    expect(await engine2.sync()).toMatchObject({ rejected: 0, pending: 0 });

    // ---- Server state: exactly 32 objects, all intact, all rows marked uploaded ----
    const { data: listed, error: listError } = await client.storage
      .from("media")
      .list(`${company.id}/${job}`, { limit: 100 });
    expect(listError).toBeNull();
    expect(listed!.map((o) => o.name).sort()).toEqual(
      captured.map((c) => c.path.split("/").pop()).sort(),
    );
    for (const c of captured.filter((x) => x.kind === "video").concat(photo)) {
      const { data: blob, error: dlError } = await client.storage.from("media").download(c.path);
      expect(dlError).toBeNull();
      const got = createHash("sha256")
        .update(new Uint8Array(await blob!.arrayBuffer()))
        .digest("hex");
      expect(got, `${c.kind} ${c.id} unchanged`).toBe(c.sha);
    }
    const { data: rows } = await client
      .from("media")
      .select("id, upload_state, storage_path")
      .eq("job_id", job);
    expect(rows).toHaveLength(32);
    expect(rows!.every((r) => r.upload_state === "uploaded")).toBe(true);

    // Originals cannot be overwritten.
    const overwrite = await client.storage
      .from("media")
      .upload(photo.path, new Uint8Array([1, 2, 3]), { upsert: true, contentType: "image/jpeg" });
    expect(overwrite.error).not.toBeNull();
  }, 300_000);
});
