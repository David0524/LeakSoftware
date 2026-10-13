"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import {
  extensionForMime,
  mediaStoragePath,
  parseMarkup,
  signatureStoragePath,
  uuidv7,
  type MediaKind,
  type SignaturePurpose,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import { deepgram, transcribeMedia } from "@/server/transcribe";

// Photos, videos, voice notes, and signatures from the browser (M9.5). The browser uploads
// the file straight to storage with a one-time upload URL made here as the signed-in member
// (storage rules apply), then this records the row. Originals are never changed.

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const KINDS: MediaKind[] = ["photo", "video", "audio"];
const PURPOSES: SignaturePurpose[] = ["inspection_ack", "work_authorization", "completion"];

async function ctx() {
  const office = await getOffice();
  return { office, db: await createClient() };
}

async function jobInCompany(
  db: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  jobId: string,
) {
  const { data } = await db
    .from("job")
    .select("id")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  return Boolean(data);
}

/** A one-time upload URL for a new photo, video, voice note, or signature drawing. */
export async function startUpload(input: {
  jobId: string;
  kind: MediaKind | "signature";
  mime: string;
}): Promise<Result<{ id: string; path: string; url: string }>> {
  const { office, db } = await ctx();
  if (!(await jobInCompany(db, office.company.id, input.jobId)))
    return { ok: false, error: "Job not found." };
  const id = uuidv7();
  let path: string;
  try {
    if (input.kind === "signature") {
      if (input.mime !== "image/svg+xml") return { ok: false, error: "Not a signature." };
      path = signatureStoragePath(office.company.id, input.jobId, id);
    } else {
      if (!KINDS.includes(input.kind)) return { ok: false, error: "Not a photo or recording." };
      extensionForMime(input.mime);
      path = mediaStoragePath(office.company.id, input.jobId, id, input.mime);
    }
  } catch {
    return { ok: false, error: "That file type isn’t supported. Use a JPEG, PNG, MP4, or MOV." };
  }
  const { data, error } = await db.storage.from("media").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Upload not allowed." };
  return { ok: true, value: { id, path, url: data.signedUrl } };
}

export interface UploadedMedia {
  id: string;
  jobId: string;
  kind: MediaKind;
  path: string;
  mime: string;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  attachTo: string;
  caption: string;
}

/** Record a file the browser finished uploading. Voice notes are then transcribed. */
export async function finishUpload(m: UploadedMedia): Promise<Result<null>> {
  const { office, db } = await ctx();
  if (!KINDS.includes(m.kind)) return { ok: false, error: "Not a photo or recording." };
  if (m.path !== mediaStoragePath(office.company.id, m.jobId, m.id, m.mime))
    return { ok: false, error: "Upload not found." };
  // "finding:<id>" or "component:<id>"; anything else attaches to the whole job.
  const [target, targetId] = m.attachTo.split(":");
  const { error } = await db.from("media").insert({
    id: m.id,
    company_id: office.company.id,
    job_id: m.jobId,
    finding_id: target === "finding" ? targetId : null,
    job_component_id: target === "component" ? targetId : null,
    kind: m.kind,
    storage_path: m.path,
    upload_state: "uploaded",
    mime_type: m.mime,
    size_bytes: Math.round(m.size),
    sha256: /^[0-9a-f]{64}$/.test(m.sha256) ? m.sha256 : null,
    width: m.width,
    height: m.height,
    duration_ms: m.durationMs != null ? Math.round(m.durationMs) : null,
    captured_at: m.capturedAt,
    latitude: m.latitude,
    longitude: m.longitude,
    caption: m.caption.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  if (m.kind === "audio") after(() => transcribe(m.id));
  revalidatePath(`/jobs/${m.jobId}`);
  return { ok: true, value: null };
}

/** Best effort, like the phone: the office can still play the recording without it. */
async function transcribe(mediaId: string) {
  const admin = adminClient();
  const key = process.env.DEEPGRAM_API_KEY;
  if (!admin || !key) return;
  const db = await createClient();
  await transcribeMedia(
    {
      async loadMedia(id) {
        const { data } = await db
          .from("media")
          .select("id, kind, upload_state, storage_path, transcript, transcript_status")
          .eq("id", id)
          .maybeSingle();
        return data;
      },
      async signedUrl(path) {
        const { data, error } = await db.storage.from("media").createSignedUrl(path, 600);
        if (error || !data) throw new Error(error?.message ?? "No signed URL");
        return data.signedUrl;
      },
      async saveTranscript(id, values) {
        await admin.from("media").update(values).eq("id", id);
      },
      speechToText: deepgram(key),
    },
    mediaId,
  );
}

/** Arrows, circles, and labels drawn over a photo, and its caption. The photo is untouched. */
export async function saveMarkup(input: {
  jobId: string;
  mediaId: string;
  markup: unknown;
  caption: string;
}): Promise<Result<null>> {
  const { office, db } = await ctx();
  const { error } = await db
    .from("media")
    .update({ markup: parseMarkup(input.markup), caption: input.caption.trim() || null })
    .eq("id", input.mediaId)
    .eq("company_id", office.company.id)
    .eq("kind", "photo");
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true, value: null };
}

/** Take a photo or recording off the job. The original file stays in storage. */
export async function deleteMedia(input: {
  jobId: string;
  mediaId: string;
}): Promise<Result<null>> {
  const { office, db } = await ctx();
  const { error } = await db
    .from("media")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.mediaId)
    .eq("company_id", office.company.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true, value: null };
}

/** Record a signature whose drawing the browser uploaded. */
export async function finishSignature(input: {
  id: string;
  jobId: string;
  path: string;
  purpose: SignaturePurpose;
  signerName: string;
  signerRole: string;
  latitude: number | null;
  longitude: number | null;
}): Promise<Result<null>> {
  const { office, db } = await ctx();
  if (!PURPOSES.includes(input.purpose))
    return { ok: false, error: "Choose what this signature is for." };
  if (!input.signerName.trim()) return { ok: false, error: "Enter the signer’s name." };
  if (input.path !== signatureStoragePath(office.company.id, input.jobId, input.id))
    return { ok: false, error: "Upload not found." };
  const { error } = await db.from("signature").insert({
    id: input.id,
    company_id: office.company.id,
    job_id: input.jobId,
    purpose: input.purpose,
    signer_name: input.signerName.trim(),
    signer_role: input.signerRole.trim() || null,
    image_path: input.path,
    signed_at: new Date().toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    device_id: "web",
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/jobs/${input.jobId}`);
  return { ok: true, value: null };
}
