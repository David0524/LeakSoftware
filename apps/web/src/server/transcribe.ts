import { friendlyError } from "@leakbook/core"; // Voice-note transcription (BUILD_PLAN M5). The phone records offline and uploads the
// audio; once uploaded it asks this server to transcribe. The transcript is written to the
// media row by the server and reaches every device through normal sync.

export interface AudioMedia {
  id: string;
  kind: string;
  upload_state: string;
  storage_path: string | null;
  transcript: string | null;
  transcript_status: string;
  company_id?: string;
}

export interface TranscribeDeps {
  /** The media row as the calling user sees it (RLS), or null if not theirs. */
  loadMedia(id: string): Promise<AudioMedia | null>;
  /** A short-lived URL the speech service can download the audio from. */
  signedUrl(path: string): Promise<string>;
  /** Server-side write; transcripts are not writable from devices. */
  saveTranscript(
    id: string,
    values: { transcript?: string | null; transcript_status: "pending" | "done" | "failed" },
  ): Promise<void>;
  speechToText(audioUrl: string): Promise<string>;
  /**
   * Why this voice note can't be transcribed now (a read-only shop, or today's allowance is
   * used up), or null to go ahead.
   */
  mayStart?(media: AudioMedia): Promise<string | null>;
  /**
   * Mark the note pending only if no one else is transcribing it, so each note costs one
   * transcription at a time (security audit, 2026-10-17). False when another request has it.
   */
  claim?(id: string): Promise<boolean>;
}

export type TranscribeResult =
  | { status: 200; body: { transcript: string; status: "done" } }
  | { status: 400 | 404 | 409 | 423 | 429 | 502; body: { error: string } };

export async function transcribeMedia(
  deps: TranscribeDeps,
  mediaId: string,
): Promise<TranscribeResult> {
  const media = await deps.loadMedia(mediaId);
  if (!media) return { status: 404, body: { error: "Voice note not found" } };
  if (media.kind !== "audio") return { status: 400, body: { error: "Only voice notes" } };
  if (media.transcript_status === "done" && media.transcript !== null)
    return { status: 200, body: { transcript: media.transcript, status: "done" } };
  if (media.upload_state !== "uploaded" || !media.storage_path)
    return { status: 409, body: { error: "The audio has not finished uploading" } };

  const refusal = (await deps.mayStart?.(media)) ?? null;
  if (refusal)
    return { status: refusal.includes("read-only") ? 423 : 429, body: { error: refusal } };
  if (deps.claim) {
    if (!(await deps.claim(mediaId)))
      return { status: 409, body: { error: "This voice note is already being transcribed" } };
  } else {
    await deps.saveTranscript(mediaId, { transcript_status: "pending" });
  }
  try {
    const transcript = await deps.speechToText(await deps.signedUrl(media.storage_path));
    await deps.saveTranscript(mediaId, { transcript, transcript_status: "done" });
    return { status: 200, body: { transcript, status: "done" } };
  } catch (e) {
    await deps.saveTranscript(mediaId, { transcript_status: "failed" });
    return {
      status: 502,
      body: { error: `Transcription failed: ${friendlyError(e)}` },
    };
  }
}

/** Deepgram pre-recorded transcription from a URL. */
export function deepgram(apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async (audioUrl: string): Promise<string> => {
    const res = await fetchImpl(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true",
      {
        method: "POST",
        headers: { authorization: `Token ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ url: audioUrl }),
      },
    );
    if (!res.ok) throw new Error(`Deepgram ${res.status}`);
    const json = (await res.json()) as {
      results?: { channels?: { alternatives?: { transcript?: string }[] }[] };
    };
    return (json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "").trim();
  };
}
