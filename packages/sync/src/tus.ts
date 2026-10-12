import type { UploadJob, Uploader } from "./uploads";

/** Reads a local file in pieces, so large videos never sit in memory twice. */
export interface FileSource {
  size(path: string): Promise<number>;
  read(path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
}

export interface TusUploaderOptions {
  /** Project URL, e.g. https://xyz.supabase.co */
  supabaseUrl: string;
  /** Publishable key, sent as `apikey`. */
  apiKey: string;
  /** The signed-in user's access token. Storage RLS checks the company folder. */
  accessToken(): Promise<string | null>;
  files: FileSource;
  bucket?: string;
  fetch?: typeof fetch;
  /** Supabase requires 6 MB chunks (the last one may be smaller). */
  chunkSize?: number;
}

export class UploadHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const CHUNK = 6 * 1024 * 1024;

/**
 * Resumable uploads to Supabase Storage (TUS 1.0). The upload URL is saved after creation,
 * so a killed app resumes from the last confirmed byte instead of starting over. Uploads
 * never overwrite: if the object already exists (an earlier attempt finished but the app
 * died before recording it), the result is "exists".
 */
export class TusUploader implements Uploader {
  private readonly endpoint: string;
  private readonly bucket: string;
  private readonly fetch: typeof fetch;
  private readonly chunkSize: number;

  constructor(private readonly opts: TusUploaderOptions) {
    this.endpoint = `${opts.supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
    this.bucket = opts.bucket ?? "media";
    this.fetch = opts.fetch ?? ((...args) => globalThis.fetch(...args));
    this.chunkSize = opts.chunkSize ?? CHUNK;
  }

  async upload(
    job: UploadJob,
    saveResumeUrl: (url: string | null) => void,
  ): Promise<"uploaded" | "exists"> {
    const token = await this.opts.accessToken();
    if (!token) throw new Error("Not signed in");
    const headers = {
      authorization: `Bearer ${token}`,
      apikey: this.opts.apiKey,
      "tus-resumable": "1.0.0",
    };
    const size = await this.opts.files.size(job.localPath);

    let url = job.resumeUrl;
    let offset = url ? await this.offsetOf(url, headers) : null;
    if (offset === null) {
      const created = await this.fetch(this.endpoint, {
        method: "POST",
        headers: {
          ...headers,
          "upload-length": String(size),
          "upload-metadata": [
            `bucketName ${b64(this.bucket)}`,
            `objectName ${b64(job.storagePath)}`,
            `contentType ${b64(job.mimeType)}`,
            `cacheControl ${b64("31536000")}`,
          ].join(","),
          "x-upsert": "false",
        },
      });
      if (created.status === 409) {
        const body = await created.text();
        if (!/already exists/i.test(body)) throw new UploadHttpError(409, `Upload create: ${body}`);
        saveResumeUrl(null);
        return "exists";
      }
      if (created.status !== 201) throw await httpError("create", created);
      const location = created.headers.get("location");
      if (!location) throw new Error("Upload server did not return a location");
      url = new URL(location, this.endpoint).toString();
      saveResumeUrl(url);
      offset = 0;
    }

    while (offset < size) {
      const length = Math.min(this.chunkSize, size - offset);
      const body = await this.opts.files.read(job.localPath, offset, length);
      const res: Response = await this.fetch(url!, {
        method: "PATCH",
        headers: {
          ...headers,
          "upload-offset": String(offset),
          "content-type": "application/offset+octet-stream",
        },
        body,
      });
      if (res.status === 409) {
        // The server has a different offset (a chunk landed but its reply was lost).
        const actual = await this.offsetOf(url!, headers);
        if (actual === null) throw new Error("Upload expired; it will restart");
        offset = actual;
        continue;
      }
      if (res.status !== 204 && res.status !== 200) throw await httpError("chunk", res);
      offset = Number(res.headers.get("upload-offset") ?? offset + length);
    }
    saveResumeUrl(null);
    return "uploaded";
  }

  /** Bytes the server has for this upload, or null if it no longer knows it. */
  private async offsetOf(url: string, headers: Record<string, string>): Promise<number | null> {
    const res = await this.fetch(url, { method: "HEAD", headers });
    if (res.status === 404 || res.status === 410 || res.status === 403) return null;
    if (!res.ok) throw await httpError("resume", res);
    const value = res.headers.get("upload-offset");
    return value === null ? null : Number(value);
  }
}

function b64(text: string): string {
  // Paths and MIME types are ASCII.
  return btoa(text);
}

async function httpError(step: string, res: Response): Promise<UploadHttpError> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 200);
  } catch {
    // ignore
  }
  return new UploadHttpError(res.status, `Upload ${step} failed (${res.status}) ${detail}`.trim());
}
