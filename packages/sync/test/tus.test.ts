import { describe, expect, it } from "vitest";
import { TusUploader, type FileSource, type UploadJob } from "../src";

/** A small in-memory TUS server with Supabase's rules: no overwrite, 409 on conflicts. */
function fakeServer() {
  const objects = new Map<string, Uint8Array>();
  const uploads = new Map<string, { path: string; length: number; data: number[] }>();
  const log: string[] = [];
  let next = 0;
  /** Throw after the server has processed this many more PATCHes (reply lost, app killed). */
  let dropAfterPatches = Infinity;

  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const h = new Headers(init?.headers);
    log.push(method);
    if (h.get("authorization") !== "Bearer tok") return new Response("no", { status: 401 });
    if (method === "POST") {
      const meta = Object.fromEntries(
        h
          .get("upload-metadata")!
          .split(",")
          .map((kv) => {
            const [k, v] = kv.split(" ");
            return [k, atob(v!)];
          }),
      );
      const path = `${meta.bucketName}/${meta.objectName}`;
      if (objects.has(path) || [...uploads.values()].some((u) => u.path === path))
        return new Response("The resource already exists", { status: 409 });
      const id = `https://x.supabase.co/storage/v1/upload/resumable/u${next++}`;
      uploads.set(id, { path, length: Number(h.get("upload-length")), data: [] });
      return new Response(null, { status: 201, headers: { location: id } });
    }
    const up = uploads.get(url);
    if (!up) return new Response(null, { status: 404 });
    if (method === "HEAD")
      return new Response(null, {
        status: 200,
        headers: { "upload-offset": String(up.data.length) },
      });
    if (method === "PATCH") {
      if (Number(h.get("upload-offset")) !== up.data.length)
        return new Response("offset", { status: 409 });
      up.data.push(...(init!.body as Uint8Array));
      if (up.data.length === up.length) {
        objects.set(up.path, Uint8Array.from(up.data));
        uploads.delete(url);
      }
      if (dropAfterPatches-- <= 1) {
        dropAfterPatches = Infinity;
        throw new TypeError("Network request failed");
      }
      return new Response(null, {
        status: 204,
        headers: { "upload-offset": String(up.data.length) },
      });
    }
    return new Response(null, { status: 405 });
  };
  return {
    fetch: fetch as typeof globalThis.fetch,
    objects,
    uploads,
    log,
    dropAfter(n: number) {
      dropAfterPatches = n;
    },
  };
}

function bytes(n: number) {
  return Uint8Array.from({ length: n }, (_, i) => (i * 7) % 256);
}

function setup(file: Uint8Array) {
  const server = fakeServer();
  const files: FileSource = {
    size: async () => file.length,
    read: async (_p, offset, length) => file.slice(offset, offset + length),
  };
  const uploader = new TusUploader({
    supabaseUrl: "https://x.supabase.co/",
    apiKey: "pk",
    accessToken: async () => "tok",
    files,
    fetch: server.fetch,
    chunkSize: 10,
  });
  let resumeUrl: string | null = null;
  const job = (): UploadJob => ({
    mediaId: "m1",
    companyId: "c",
    localPath: "/f",
    storagePath: "c/j/m1.mp4",
    mimeType: "video/mp4",
    resumeUrl,
  });
  const save = (u: string | null) => {
    resumeUrl = u;
  };
  return { server, uploader, job, save, resume: () => resumeUrl };
}

describe("TusUploader", () => {
  it("uploads in chunks into the media bucket", async () => {
    const file = bytes(25);
    const { server, uploader, job, save, resume } = setup(file);
    expect(await uploader.upload(job(), save)).toBe("uploaded");
    expect(server.objects.get("media/c/j/m1.mp4")).toEqual(file);
    expect(server.log).toEqual(["POST", "PATCH", "PATCH", "PATCH"]);
    expect(resume()).toBeNull();
  });

  it("resumes from the server's offset after the app dies mid-upload", async () => {
    const file = bytes(45);
    const { server, uploader, job, save, resume } = setup(file);
    server.dropAfter(2);
    await expect(uploader.upload(job(), save)).rejects.toThrow("Network request failed");
    expect(resume()).toMatch(/resumable\/u0$/);

    server.log.length = 0;
    expect(await uploader.upload(job(), save)).toBe("uploaded");
    // HEAD finds 20 bytes; only the remaining 3 chunks are sent.
    expect(server.log).toEqual(["HEAD", "PATCH", "PATCH", "PATCH"]);
    expect(server.objects.get("media/c/j/m1.mp4")).toEqual(file);
  });

  it("reports an object finished by an earlier attempt as already there", async () => {
    const file = bytes(15);
    const { server, uploader, job, save } = setup(file);
    // The last chunk lands, but the reply is lost.
    server.dropAfter(2);
    await expect(uploader.upload(job(), save)).rejects.toThrow();
    expect(server.objects.has("media/c/j/m1.mp4")).toBe(true);
    // The saved upload is gone on the server (404), so it tries to create, which conflicts.
    expect(await uploader.upload(job(), save)).toBe("exists");
    expect(server.objects.size).toBe(1);
  });

  it("recovers when a chunk landed but its reply was lost", async () => {
    const file = bytes(30);
    const { server, uploader, job, save } = setup(file);
    let first = true;
    const realFetch = server.fetch;
    // Answer the first PATCH with a stale offset to force the 409 path.
    const wrapped = (async (input: string | URL | Request, init?: RequestInit) => {
      const res = await realFetch(input, init);
      if (init?.method === "PATCH" && first) {
        first = false;
        const h = new Headers(init.headers);
        h.set("upload-offset", "0");
        return realFetch(input, { ...init, headers: h });
      }
      return res;
    }) as typeof fetch;
    (uploader as unknown as { fetch: typeof fetch }).fetch = wrapped;
    expect(await uploader.upload(job(), save)).toBe("uploaded");
    expect(server.objects.get("media/c/j/m1.mp4")).toEqual(file);
  });

  it("fails without a session so the file stays queued", async () => {
    const { job, save } = setup(bytes(1));
    const u = new TusUploader({
      supabaseUrl: "https://x.supabase.co",
      apiKey: "pk",
      accessToken: async () => null,
      files: { size: async () => 1, read: async () => new Uint8Array(1) },
    });
    await expect(u.upload(job(), save)).rejects.toThrow("Not signed in");
  });

  it("says plainly when storage refuses a file, and throws so it stays queued (M2)", async () => {
    const refuse = (status: number, body: string) =>
      new TusUploader({
        supabaseUrl: "https://x.supabase.co",
        apiKey: "pk",
        accessToken: async () => "tok",
        files: { size: async () => 1, read: async () => new Uint8Array(1) },
        fetch: (async () => new Response(body, { status })) as typeof fetch,
      });
    const { job, save } = setup(bytes(1));
    await expect(
      refuse(413, "The object exceeded the maximum allowed size").upload(job(), save),
    ).rejects.toThrow("That file is too large to upload (50 MB at most).");
    await expect(
      refuse(415, "mime type text/html is not supported").upload(job(), save),
    ).rejects.toThrow("That type of file can’t be uploaded.");
    await expect(
      refuse(403, "new row violates row-level security policy").upload(job(), save),
    ).rejects.toThrow("This shop is read-only until the subscription is paid");
    await expect(refuse(500, "boom").upload(job(), save)).rejects.toThrow(
      "Upload create failed (500) boom",
    );
  });
});
