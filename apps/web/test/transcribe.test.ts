import { describe, expect, it } from "vitest";
import {
  deepgram,
  transcribeMedia,
  type AudioMedia,
  type TranscribeDeps,
} from "../src/server/transcribe";

function deps(media: AudioMedia | null, speech: (url: string) => Promise<string>) {
  const writes: unknown[] = [];
  const d: TranscribeDeps = {
    loadMedia: async () => media,
    signedUrl: async (p) => `https://signed/${p}`,
    saveTranscript: async (id, values) => {
      writes.push({ id, ...values });
    },
    speechToText: speech,
  };
  return { d, writes };
}

const audio: AudioMedia = {
  id: "m1",
  kind: "audio",
  upload_state: "uploaded",
  storage_path: "c/j/m1.m4a",
  transcript: null,
  transcript_status: "none",
};

describe("transcribeMedia", () => {
  it("transcribes an uploaded voice note and records progress", async () => {
    const { d, writes } = deps(audio, async (url) => `heard ${url}`);
    expect(await transcribeMedia(d, "m1")).toEqual({
      status: 200,
      body: { transcript: "heard https://signed/c/j/m1.m4a", status: "done" },
    });
    expect(writes).toEqual([
      { id: "m1", transcript_status: "pending" },
      { id: "m1", transcript: "heard https://signed/c/j/m1.m4a", transcript_status: "done" },
    ]);
  });

  it("refuses rows the user cannot see, non-audio, and audio still uploading", async () => {
    const speech = async () => "x";
    expect((await transcribeMedia(deps(null, speech).d, "m1")).status).toBe(404);
    expect((await transcribeMedia(deps({ ...audio, kind: "photo" }, speech).d, "m1")).status).toBe(
      400,
    );
    const pending = deps({ ...audio, upload_state: "pending" }, speech);
    expect((await transcribeMedia(pending.d, "m1")).status).toBe(409);
    expect(pending.writes).toEqual([]);
  });

  it("does not transcribe twice", async () => {
    let calls = 0;
    const { d, writes } = deps(
      { ...audio, transcript: "done", transcript_status: "done" },
      async () => {
        calls += 1;
        return "again";
      },
    );
    expect((await transcribeMedia(d, "m1")).body).toEqual({ transcript: "done", status: "done" });
    expect(calls).toBe(0);
    expect(writes).toEqual([]);
  });

  it("marks the note failed when the speech service fails", async () => {
    const { d, writes } = deps(audio, async () => {
      throw new Error("Deepgram 500");
    });
    expect(await transcribeMedia(d, "m1")).toMatchObject({ status: 502 });
    expect(writes.at(-1)).toEqual({ id: "m1", transcript_status: "failed" });
  });
});

describe("deepgram", () => {
  it("sends the audio URL and reads the first transcript", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return Response.json({
        results: { channels: [{ alternatives: [{ transcript: " Return three is leaking. " }] }] },
      });
    }) as unknown as typeof fetch;
    expect(await deepgram("key", fake)("https://signed/a.m4a")).toBe("Return three is leaking.");
    expect(sent!.url).toMatch(/^https:\/\/api\.deepgram\.com\/v1\/listen\?model=nova-3/);
    expect(new Headers(sent!.init.headers).get("authorization")).toBe("Token key");
    expect(JSON.parse(String(sent!.init.body))).toEqual({ url: "https://signed/a.m4a" });
  });

  it("throws on an error response", async () => {
    const fake = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(deepgram("bad", fake)("u")).rejects.toThrow("Deepgram 401");
  });
});
