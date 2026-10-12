import { useEffect, useMemo, useState } from "react";
import { mediaStoragePath, uuidv7, type Media } from "@leakbook/core";
import { getServices } from "../lib/services";
import {
  askLocationOnce,
  currentPosition,
  localMediaUri,
  storeCapture,
  type CapturedFile,
} from "../lib/media";
import { useRows } from "./hooks";

/** What a capture is attached to. Job-level captures have no other link. */
export interface MediaTarget {
  jobId: string;
  findingId?: string | null;
  componentId?: string | null;
  testResultId?: string | null;
}

/** Captures for a job, newest first. With a target, only those attached to it. */
export function useJobMedia(companyId: string, jobId: string, target?: Omit<MediaTarget, "jobId">) {
  const all = useRows<Media>("media", companyId);
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

export function useMediaUri(media: Media | undefined): string | null {
  const local = media ? localMediaUri(media.id, media.mime_type) : null;
  const path = media?.upload_state === "uploaded" ? media.storage_path : null;
  const cached = path ? signed.get(path) : undefined;
  const [remote, setRemote] = useState<string | null>(() =>
    cached && cached.expires > Date.now() ? cached.url : null,
  );
  useEffect(() => {
    if (local || !path || remote) return;
    let alive = true;
    void getServices()
      .supabase.storage.from("media")
      .createSignedUrl(path, SIGNED_SECONDS)
      .then(({ data }) => {
        if (!data || !alive) return;
        signed.set(path, {
          url: data.signedUrl,
          expires: Date.now() + (SIGNED_SECONDS - 60) * 1000,
        });
        setRemote(data.signedUrl);
      });
    return () => {
      alive = false;
    };
  }, [local, path, remote]);
  return local ?? remote;
}
