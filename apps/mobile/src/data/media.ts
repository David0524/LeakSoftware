import { useEffect, useMemo, useState } from "react";
import { mediaStoragePath, uuidv7, type Media } from "@leakbook/core";
import { getServices } from "../lib/services";
import {
  askLocationOnce,
  currentPosition,
  localMediaUri,
  recoverCapture,
  storeCapture,
  type CapturedFile,
} from "../lib/media";
import { useJobRows } from "./hooks";

/** What a capture is attached to. Job-level captures have no other link. */
export interface MediaTarget {
  jobId: string;
  findingId?: string | null;
  componentId?: string | null;
  testResultId?: string | null;
}

/** Captures for a job, newest first. With a target, only those attached to it. */
export function useJobMedia(companyId: string, jobId: string, target?: Omit<MediaTarget, "jobId">) {
  const all = useJobRows<Media>("media", companyId, jobId);
  const findingId = target?.findingId;
  const componentId = target?.componentId;
  const testResultId = target?.testResultId;
  return useMemo(
    () =>
      all
        .filter(
          (m) =>
            m.job_id === jobId &&
            (!findingId || m.finding_id === findingId) &&
            (!componentId || m.job_component_id === componentId) &&
            (!testResultId || m.test_result_id === testResultId),
        )
        .sort((a, b) =>
          (b.captured_at ?? b.created_at).localeCompare(a.captured_at ?? a.created_at),
        ),
    [all, jobId, findingId, componentId, testResultId],
  );
}

// A capture under way, kept on the phone so one Android closed the app during can still be
// attached where it was meant to go (lib/media's recoverCapture).
const CAPTURE_KEY = "capture:pending";

export interface CaptureIntent {
  companyId: string;
  target: MediaTarget;
  kind: "photo" | "video";
  source: "camera" | "library";
}

/** The camera or library is about to open for this target. */
export function rememberCapture(intent: CaptureIntent) {
  getServices().kv.set(CAPTURE_KEY, JSON.stringify(intent));
}

/** The capture came back (or was canceled) in this run of the app. */
export function forgetCapture() {
  getServices().kv.remove(CAPTURE_KEY);
}

function rememberedCapture(): CaptureIntent | null {
  try {
    const v = JSON.parse(getServices().kv.get(CAPTURE_KEY) ?? "null") as CaptureIntent | null;
    return v &&
      typeof v.companyId === "string" &&
      typeof v.target?.jobId === "string" &&
      (v.kind === "photo" || v.kind === "video") &&
      (v.source === "camera" || v.source === "library")
      ? v
      : null;
  } catch {
    return null;
  }
}

/**
 * At start: a photo or video taken while Android closed the app is saved to the target it was
 * taken for. Returns that job's id, or null when there was nothing to recover. Never throws.
 */
export async function recoverPendingCapture(): Promise<string | null> {
  const intent = rememberedCapture();
  if (!intent) return null;
  forgetCapture();
  try {
    const file = await recoverCapture(intent.kind, intent.source);
    if (!file) return null;
    await saveCapture(intent.companyId, intent.target, file, Promise.resolve(null));
    return intent.target.jobId;
  } catch {
    return null;
  }
}

/** Save a capture: file into the media folder, row and upload ticket into the database. */
export async function saveCapture(
  companyId: string,
  target: MediaTarget,
  captured: CapturedFile,
  position: Promise<{ latitude: number; longitude: number } | null>,
): Promise<string> {
  const id = uuidv7();
  const stored = await storeCapture(id, captured);
  const where = await position;
  getServices().sync.addMedia(
    id,
    companyId,
    {
      job_id: target.jobId,
      finding_id: target.findingId ?? null,
      job_component_id: target.componentId ?? null,
      test_result_id: target.testResultId ?? null,
      kind: captured.kind,
      mime_type: captured.mime,
      size_bytes: stored.sizeBytes,
      sha256: stored.sha256,
      width: captured.width,
      height: captured.height,
      duration_ms: captured.durationMs,
      captured_at: captured.capturedAt,
      latitude: where?.latitude ?? null,
      longitude: where?.longitude ?? null,
      upload_state: "pending",
    },
    {
      localPath: stored.relativePath,
      storagePath: mediaStoragePath(companyId, target.jobId, id, captured.mime),
      mimeType: captured.mime,
    },
  );
  return id;
}

/**
 * Ask for location the first time (before the camera opens, so two permission prompts never
 * overlap), then return the lookup to run alongside the capture.
 */
export async function prepareLocation() {
  await askLocationOnce();
  return currentPosition();
}

// ---------------------------------------------------------------------------
// Display: the local file when this phone has it, otherwise a short-lived signed URL
// ---------------------------------------------------------------------------

const signed = new Map<string, { url: string; expires: number }>();
const SIGNED_SECONDS = 3600;

export type MediaSourceState = "ready" | "loading" | "unavailable";

/**
 * Where to load a capture from, and whether it can be shown: "loading" while a download
 * link is fetched, "unavailable" when the file is elsewhere and there is no connection.
 * `retry` asks again.
 */
export function useMediaSource(media: Media | undefined): {
  uri: string | null;
  state: MediaSourceState;
  retry: () => void;
} {
  const local = media ? localMediaUri(media.id, media.mime_type) : null;
  const path = media?.upload_state === "uploaded" ? media.storage_path : null;
  const [attempt, setAttempt] = useState(0);
  const [remote, setRemote] = useState<{ url: string | null; failed: boolean }>(() => {
    const cached = path ? signed.get(path) : undefined;
    return { url: cached && cached.expires > Date.now() ? cached.url : null, failed: false };
  });
  useEffect(() => {
    if (local || !path || remote.url) return;
    let alive = true;
    void getServices()
      .supabase.storage.from("media")
      .createSignedUrl(path, SIGNED_SECONDS)
      .then(({ data }) => {
        if (!alive) return;
        if (!data) {
          setRemote({ url: null, failed: true });
          return;
        }
        signed.set(path, {
          url: data.signedUrl,
          expires: Date.now() + (SIGNED_SECONDS - 60) * 1000,
        });
        setRemote({ url: data.signedUrl, failed: false });
      })
      .catch(() => alive && setRemote({ url: null, failed: true }));
    return () => {
      alive = false;
    };
  }, [local, path, remote.url, attempt]);

  const uri = local ?? remote.url;
  const state: MediaSourceState = uri
    ? "ready"
    : path && !remote.failed
      ? "loading"
      : "unavailable";
  return {
    uri,
    state,
    retry: () => {
      setRemote({ url: null, failed: false });
      setAttempt((n) => n + 1);
    },
  };
}

export function useMediaUri(media: Media | undefined): string | null {
  return useMediaSource(media).uri;
}
