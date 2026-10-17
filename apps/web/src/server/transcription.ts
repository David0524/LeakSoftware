import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deepgram, type TranscribeDeps } from "./transcribe";
import { LIMIT_MESSAGE, READ_ONLY_MESSAGE, shopWritable, takeAllowance } from "./usage";

/** A pending transcription older than this is treated as abandoned and can be retried. */
const STALE_PENDING_MS = 5 * 60_000;

/**
 * Transcription wired to Supabase: the note is read and its audio signed as the member (RLS
 * and storage rules), and the transcript is written by the server.
 */
export function transcriptionDeps(
  asUser: SupabaseClient,
  admin: SupabaseClient,
  deepgramKey: string,
): TranscribeDeps {
  return {
    async loadMedia(mediaId) {
      const { data } = await asUser
        .from("media")
        .select("id, company_id, kind, upload_state, storage_path, transcript, transcript_status")
        .eq("id", mediaId)
        .is("deleted_at", null)
        .maybeSingle();
      return data;
    },
    async signedUrl(path) {
      const { data, error } = await asUser.storage.from("media").createSignedUrl(path, 600);
      if (error || !data) throw new Error(error?.message ?? "No signed URL");
      return data.signedUrl;
    },
    async saveTranscript(mediaId, values) {
      const { error } = await admin.from("media").update(values).eq("id", mediaId);
      if (error) throw new Error(error.message);
    },
    async mayStart(media) {
      if (!media.company_id) return READ_ONLY_MESSAGE;
      if (!(await shopWritable(asUser, media.company_id))) return READ_ONLY_MESSAGE;
      if (!(await takeAllowance(media.company_id, "transcribe", 1, admin))) return LIMIT_MESSAGE;
      return null;
    },
    async claim(mediaId) {
      const stale = new Date(Date.now() - STALE_PENDING_MS).toISOString();
      const { data, error } = await admin
        .from("media")
        .update({ transcript_status: "pending" })
        .eq("id", mediaId)
        .or(
          `transcript_status.in.(none,failed),and(transcript_status.eq.pending,updated_at.lt.${stale})`,
        )
        .select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    speechToText: deepgram(deepgramKey),
  };
}
