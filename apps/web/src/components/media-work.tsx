"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  MARKUP_COLORS,
  MARKUP_TEXT_MAX,
  UPLOAD_LIMITS,
  removedKindOfMedia,
  uploadRefusal,
  uploadRefusalMessage,
  MARKUP_TEXT_SIZE_MAX,
  MARKUP_TEXT_SIZE_MIN,
  moveText,
  resizeText,
  MEDIA_LIMITS,
  MIN_INK,
  fitWithin,
  formatDuration,
  inkLength,
  shapeAtTap,
  shapeFromDrag,
  signatureStatement,
  signatureSvg,
  strokePath,
  penShape,
  textShape,
  type MarkupColor,
  type MarkupShape,
  type MediaKind,
  type SignaturePurpose,
  type SignatureStroke,
  friendlyError,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import {
  deleteMedia,
  finishSignature,
  finishUpload,
  restoreMedia,
  saveMarkup,
  startUpload,
} from "@/app/actions/media";
import { MarkupOverlay } from "./markup";
import { showRemoved } from "./removed";
import { Segmented } from "./segmented";
import { DISCARD_PROMPT } from "@/lib/dirty";
import { useNextStep } from "./next-step-events";
import { RowActions, RowMenuButton, type MenuEntry } from "./row-actions";
import { useConfirm } from "./sheet";
import { Button, Field, Select, buttonClass, cx, iconButtonClass } from "./ui";
import { SavedNote, useAutosave } from "./undo";

// Photos, videos, voice notes, markup, and signatures from a browser (M9.5): the phone app's
// capture screens. Files go straight to storage; the server records them.

const MAX_BYTES = UPLOAD_LIMITS.media;

async function sha256Hex(blob: Blob): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Where the photo was taken, only if the browser already allows it (never prompts). */
async function position(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const state = await navigator.permissions?.query({ name: "geolocation" });
    if (state?.state !== "granted") return null;
    return await new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve(null),
        { timeout: 3000, maximumAge: 60_000 },
      ),
    );
  } catch {
    return null;
  }
}

/** Photos are resized like the phone does: 2048 px on the long side, JPEG. */
async function preparePhoto(file: File) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = fitWithin(bitmap.width, bitmap.height, MEDIA_LIMITS.photoLongEdge) ?? {
      width: bitmap.width,
      height: bitmap.height,
    };
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", MEDIA_LIMITS.photoQuality),
    );
    if (blob) return { blob, mime: "image/jpeg", ...size };
  } catch {
    // Not decodable here (for example HEIC outside Safari): upload the original.
  }
  return { blob: file as Blob, mime: file.type || "image/jpeg", width: null, height: null };
}

function videoInfo(file: File): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : 0,
      });
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn’t read that video."));
    };
    video.src = url;
  });
}

const baseMime = (mime: string) => mime.split(";")[0]!.trim().toLowerCase();

/**
 * The storage server's refusal as the person should read it: too large, a type it doesn't take,
 * or a read-only shop (security review M2); otherwise the status and Try Again.
 */
async function putError(put: Response): Promise<Error> {
  const body = await put.text().catch(() => "");
  const refusal = uploadRefusal(put.status, body);
  return new Error(
    refusal ? uploadRefusalMessage(refusal, "media") : `Upload failed (${put.status}). Try again.`,
  );
}

/** Upload one file and record it. Throws with a message for the person. */
async function uploadMedia(
  jobId: string,
  kind: MediaKind,
  blob: Blob,
  mime: string,
  extra: { width: number | null; height: number | null; durationMs: number | null },
  attachTo: string,
) {
  if (blob.size > MAX_BYTES) throw new Error("That file is over 50 MB. Try a shorter video.");
  const start = await startUpload({ jobId, kind, mime });
  if (!start.ok) throw new Error(start.error);
  const [sha256, where] = await Promise.all([sha256Hex(blob), position()]);
  const put = await fetch(start.value.url, {
    method: "PUT",
    headers: { "content-type": mime, "x-upsert": "false" },
    body: blob,
  });
  if (!put.ok) throw await putError(put);
  const done = await finishUpload({
    id: start.value.id,
    jobId,
    kind,
    path: start.value.path,
    mime,
    size: blob.size,
    sha256,
    ...extra,
    capturedAt: new Date().toISOString(),
    latitude: where?.latitude ?? null,
    longitude: where?.longitude ?? null,
    attachTo,
    caption: "",
  });
  if (!done.ok) throw new Error(done.error);
}

/** Photos for one checklist item (a pool inspection question's camera button). */
export async function uploadItemPhotos(jobId: string, componentId: string, files: File[]) {
  for (const file of files) {
    const photo = await preparePhoto(file);
    await uploadMedia(
      jobId,
      "photo",
      photo.blob,
      baseMime(photo.mime),
      { width: photo.width, height: photo.height, durationMs: null },
      `component:${componentId}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export function MediaCapture({
  jobId,
  targets,
}: {
  jobId: string;
  /** "finding:<id>" or "component:<id>" with a label, for "Attach to". */
  targets: { value: string; label: string }[];
}) {
  // "Attach to" remembers the last choice for the job while the browser tab is open (owner,
  // 2026-10-20).
  const remembered = `attach-to:${jobId}`;
  const last = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(remembered);
      } catch {
        return null;
      }
    },
    // The server can't see the tab's memory.
    () => null,
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const attachTo = chosen ?? (last && targets.some((t) => t.value === last) ? last : "");
  const setAttachTo = (value: string) => {
    setChosen(value);
    try {
      sessionStorage.setItem(remembered, value);
    } catch {
      // Private browsing: remembered for this page only.
    }
  };
  const [busy, setBusy] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  // The Next Step bar's Add Photo and Add Video open the same capture (owner, 2026-10-20).
  useNextStep("add-photo", () => photoInput.current?.click());
  useNextStep("add-video", () => videoInput.current?.click());
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function run(label: string, work: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ text: await work() });
    } catch (e) {
      setMessage({ text: friendlyError(e), error: true });
    } finally {
      setBusy(null);
    }
  }

  function addPhotos(files: File[]) {
    void run("Uploading…", async () => {
      for (const [i, file] of files.entries()) {
        setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}…` : "Uploading…");
        const photo = await preparePhoto(file);
        await uploadMedia(
          jobId,
          "photo",
          photo.blob,
          baseMime(photo.mime),
          { width: photo.width, height: photo.height, durationMs: null },
          attachTo,
        );
      }
      return files.length > 1 ? `${files.length} photos added.` : "Photo added.";
    });
  }

  function addVideo(file: File) {
    void run("Uploading video…", async () => {
      const info = await videoInfo(file).catch(() => null);
      if (info && info.durationMs > (MEDIA_LIMITS.videoMaxSeconds + 1) * 1000)
        throw new Error(`Videos can be up to ${MEDIA_LIMITS.videoMaxSeconds} seconds.`);
      await uploadMedia(
        jobId,
        "video",
        file,
        baseMime(file.type || "video/mp4"),
        {
          width: info?.width ?? null,
          height: info?.height ?? null,
          durationMs: info?.durationMs ?? null,
        },
        attachTo,
      );
      return "Video added.";
    });
  }

  // Add Photo and Add Video go straight to the camera (`capture`), and Library is its own
  // button next to them (owner, 2026-10-20), for the camera roll or a file.
  const pick = (accept: string, multiple = false) => ({
    type: "file" as const,
    accept,
    multiple,
    disabled: busy !== null,
    className: "sr-only",
  });
  function addFiles(files: File[]) {
    const photos = files.filter((f) => !f.type.startsWith("video/"));
    const videos = files.filter((f) => f.type.startsWith("video/"));
    if (photos.length) addPhotos(photos);
    else if (videos[0]) addVideo(videos[0]);
  }

  return (
    <div className="space-y-3 card p-4">
      {targets.length ? (
        <Select
          label="Attach to"
          name="attach_to"
          value={attachTo}
          onChange={(e) => setAttachTo(e.target.value)}
          options={[{ value: "", label: "Whole job" }, ...targets]}
          className="max-w-md"
        />
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        <label className={cx(TILE, "cursor-pointer focus-within:outline-3")}>
          <TileIcon d={CAMERA} />
          Add Photo
          <input
            ref={photoInput}
            {...pick("image/*")}
            capture="environment"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) addPhotos(files);
            }}
          />
        </label>
        <label className={cx(TILE, "cursor-pointer focus-within:outline-3")}>
          <TileIcon d={LIBRARY} />
          Library
          <input
            {...pick("image/*,video/*", true)}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) addFiles(files);
            }}
          />
        </label>
        <label className={cx(TILE, "cursor-pointer focus-within:outline-3")}>
          <TileIcon d={VIDEO} />
          Add Video
          <input
            ref={videoInput}
            {...pick("video/*")}
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) addVideo(file);
            }}
          />
        </label>
        <VoiceNote
          disabled={busy !== null}
          onSave={(blob, mime, durationMs) =>
            run("Uploading voice note…", async () => {
              await uploadMedia(
                jobId,
                "audio",
                blob,
                mime,
                { width: null, height: null, durationMs },
                attachTo,
              );
              return "Voice note added.";
            })
          }
        />
      </div>
      <p aria-live="polite" className="text-[0.9375rem]">
        {busy ? (
          <span className="text-text-muted">{busy}</span>
        ) : message ? (
          <span
            role={message.error ? "alert" : undefined}
            className={message.error ? "text-status-fail" : "text-status-pass"}
          >
            {message.text}
          </span>
        ) : null}
      </p>
    </div>
  );
}

// Add Photo, Library, Add Video, and Voice Note sit in one row of equal tiles (icon over
// label), so they fit a phone's width without wrapping.
const TILE = cx(
  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-link/10 px-1 py-1.5 text-link transition-colors hover:bg-link/20",
  "text-center text-[0.9375rem] leading-tight font-semibold",
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
);
const CAMERA =
  "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z";
const VIDEO =
  "M3 7h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM16 11l6-3v8l-6-3";
const MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3";
const LIBRARY =
  "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 9.5a1 1 0 1 0 0-.01";

function TileIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

/** Record from the microphone, up to five minutes, like the phone's voice notes. */
function VoiceNote({
  disabled,
  onSave,
}: {
  disabled: boolean;
  onSave: (blob: Blob, mime: string, durationMs: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const keep = useRef(true);
  const started = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const ms = Date.now() - started.current;
      setElapsed(ms);
      if (ms >= MEDIA_LIMITS.voiceMaxSeconds * 1000) recorder.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm", "audio/ogg"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const mime = baseMime(rec.mimeType || type || "audio/webm");
        if (keep.current)
          onSave(new Blob(chunks, { type: mime }), mime, Date.now() - started.current);
      };
      keep.current = true;
      started.current = Date.now();
      setElapsed(0);
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      setError("Allow the microphone in your browser to record a voice note.");
    }
  }

  if (!recording)
    return (
      <>
        <button
          type="button"
          className={cx(TILE, "disabled:cursor-not-allowed disabled:opacity-50")}
          disabled={disabled}
          onClick={start}
          aria-label="Record Voice Note"
        >
          <TileIcon d={MIC} />
          Voice Note
        </button>
        {error ? (
          <p role="alert" className="col-span-4 text-[0.9375rem] text-status-fail">
            {error}
          </p>
        ) : null}
      </>
    );
  return (
    <div className="col-span-4 flex flex-wrap items-center gap-3">
      <span className="font-semibold" aria-live="polite">
        <span className="mr-2 inline-block size-3 rounded-full bg-status-fail" aria-hidden />
        Recording {formatDuration(elapsed)}
      </span>
      <Button type="button" kind="secondary" onClick={() => recorder.current?.stop()}>
        Stop and Save
      </Button>
      <Button
        type="button"
        kind="quiet"
        onClick={() => {
          keep.current = false;
          recorder.current?.stop();
        }}
      >
        Discard
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One photo or recording: Mark Up and Delete
// ---------------------------------------------------------------------------

export interface MediaCardInfo {
  id: string;
  kind: MediaKind;
  url: string | null;
  width: number;
  height: number;
  shapes: MarkupShape[];
  caption: string | null;
  label: string;
}

/**
 * One photo or recording on the job page, as a card: its preview, what it shows, then Mark Up
 * and More (Delete). Touch and hold, right-click, or "⋯" opens its menu (Edit, Delete), and a
 * swipe left shows Delete (gestures.md section 12); Delete happens at once, with Undo.
 */
export function MediaCard({
  jobId,
  media,
  preview,
  children,
}: {
  jobId: string;
  media: MediaCardInfo;
  preview: ReactNode;
  /** What it is, its caption, when it was taken. */
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canMarkUp = media.kind === "photo" && !!media.url;
  // Removed at once, with Undo for five seconds (owner, 2026-10-26), not asked first. The
  // original file stays on file either way.
  async function remove() {
    setBusy(true);
    const r = await deleteMedia({ jobId, mediaId: media.id });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    showRemoved(removedKindOfMedia(media.kind), async () => {
      const back = await restoreMedia({ jobId, mediaId: media.id });
      return back.ok ? null : back.error;
    });
  }
  const menu: MenuEntry[] = [
    canMarkUp && { label: "Edit", onSelect: () => setEditing(true) },
    "separator",
    { label: "Delete", destructive: true, onSelect: () => void remove() },
  ];
  return (
    <>
      <RowActions
        as="li"
        title={media.label}
        menu={menu}
        trailing={[{ label: "Delete", tone: "red", onSelect: () => void remove() }]}
        disabled={busy}
        className="overflow-hidden card"
        swipeClassName="rounded-[inherit]"
        // Its More button is always on the card.
        button="none"
        data-no-swipe=""
      >
        {preview}
        <div className="p-3 text-[0.9375rem]">
          {children}
          {/* Delete is behind More, away from Mark Up (owner, 2026-10-20). */}
          <div className="flex flex-wrap items-center gap-3">
            {canMarkUp ? (
              <button
                type="button"
                className={buttonClass("secondary", "min-w-24")}
                onClick={() => setEditing(true)}
                aria-label={`${media.shapes.length ? "Edit Markup" : "Mark Up"}: ${media.label}`}
              >
                {media.shapes.length ? "Edit Markup" : "Mark Up"}
              </button>
            ) : null}
            {/* The card's menu (Edit, Delete), the same as touch and hold or right-click. */}
            <RowMenuButton visible className={iconButtonClass("disabled:opacity-50")} />
          </div>
          {error ? (
            <p role="alert" className="text-status-fail">
              {error}
            </p>
          ) : null}
        </div>
      </RowActions>
      {editing && media.url ? (
        <MarkupEditor
          background={
            // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
            <img src={media.url} alt="" className="block h-full w-full" draggable={false} />
          }
          width={media.width}
          height={media.height}
          shapes={media.shapes}
          caption={media.caption ?? ""}
          onCaptionSave={async (caption) => {
            // The caption saves by itself (owner, 2026-10-20), with the markup as last saved.
            const r = await saveMarkup({
              jobId,
              mediaId: media.id,
              markup: { version: 1, shapes: media.shapes },
              caption,
            });
            return r.ok ? null : r.error;
          }}
          onCancel={() => setEditing(false)}
          onSave={async (shapes, caption) => {
            const r = await saveMarkup({
              jobId,
              mediaId: media.id,
              markup: { version: 1, shapes },
              caption,
            });
            if (!r.ok) return r.error;
            setEditing(false);
            return null;
          }}
        />
      ) : null}
    </>
  );
}

/** A dashed box around the selected label, drawn over the canvas in percentages. */
function SelectedText({
  shape,
  width,
  height,
  unit,
}: {
  shape: MarkupShape;
  width: number;
  height: number;
  unit: number;
}) {
  if (shape.type !== "text") return null;
  const px = Math.max(10, 24 * unit) * (shape.s ?? 1);
  const w = (shape.text.length * px * 0.62 + 16) / width;
  const h = (px * 1.3) / height;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute rounded-md border-2 border-dashed border-white shadow-[0_0_0_1px_rgb(0_0_0/0.5)]"
      style={{
        left: `${(shape.x - w / 2) * 100}%`,
        top: `${(shape.y - h * 0.8) * 100}%`,
        width: `${w * 100}%`,
        height: `${h * 100}%`,
      }}
    />
  );
}

const COLOR_NAMES: Record<MarkupColor, string> = { red: "Red", yellow: "Yellow", white: "White" };
type Tool = "pen" | "arrow" | "circle" | "text";

/**
 * Full-screen markup over a photo or a pool diagram: Pen (owner, 2026-10-19), Arrow, Circle,
 * and Text, in three colors, with Undo and Clear All. Shapes are fractions of the picture.
 * Without `caption`, there is no caption field (diagrams).
 */
export function MarkupEditor({
  background,
  width,
  height,
  shapes,
  caption: savedCaption,
  title = "Mark Up",
  canvasLabel = "Photo",
  onCancel,
  onSave,
  onCaptionSave,
}: {
  background: ReactNode;
  width: number;
  height: number;
  shapes: MarkupShape[];
  caption?: string;
  title?: string;
  canvasLabel?: string;
  onCancel: () => void;
  onSave: (shapes: MarkupShape[], caption: string) => Promise<string | null>;
  /** Saves the caption alone a second after typing stops, and when the field is left. */
  onCaptionSave?: (caption: string) => Promise<string | null>;
}) {
  const [history, setHistory] = useState<MarkupShape[][]>([shapes]);
  const draft = history[history.length - 1]!;
  const [live, setLive] = useState<MarkupShape | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const stroke = useRef<{ x: number; y: number }[]>([]);
  const [ink, setInk] = useState<MarkupColor>("red");
  const [label, setLabel] = useState("");
  const [caption, setCaption] = useState(savedCaption ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  const captionSave = useAutosave((savedCaption ?? "").trim(), (v) =>
    onCaptionSave ? onCaptionSave(v) : Promise.resolve(null),
  );
  // A caption that saves by itself is never lost, so Cancel asks only about the markup.
  const dirty = history.length > 1 || (!onCaptionSave && caption !== (savedCaption ?? ""));
  const push = (next: MarkupShape[]) => setHistory((h) => [...h, next]);
  // Text can be moved and resized after it's placed (owner, 2026-10-20): the Text tool selects
  // a label with a tap, a drag moves it, and Size changes it.
  const [picked, setPicked] = useState<number | null>(null);
  const resizing = useRef<number | null>(null);
  const moving = useRef<number | null>(null);
  // The same, for drawing (refs can't be read while rendering).
  const [dragging, setDragging] = useState<number | null>(null);
  const selected = picked !== null && draft[picked]?.type === "text" ? picked : null;
  const unit = width / 400;
  /** The label under a point on the canvas (fractions), topmost first. */
  const textAt = (p: { x: number; y: number }, box: DOMRect) => {
    for (let i = draft.length - 1; i >= 0; i--) {
      const t = draft[i]!;
      if (t.type !== "text") continue;
      const px = (Math.max(10, 24 * unit) * (t.s ?? 1) * box.width) / width;
      const halfW = Math.max(22, (t.text.length * px * 0.62) / 2);
      const halfH = Math.max(22, px * 0.75);
      const dx = (p.x - t.x) * box.width;
      // Text sits on its baseline: most of it is above y.
      const dy = (p.y - t.y) * box.height + px * 0.35;
      if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return i;
    }
    return null;
  };

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  function release(e: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    start.current = null;
    setLive(null);
    if (!from) return;
    if (tool === "pen") {
      const shape = penShape(ink, [...stroke.current, at(e)]);
      stroke.current = [];
      return shape ? push([...draft, shape]) : undefined;
    }
    if (tool === "text") {
      if (moving.current !== null) {
        const i = moving.current;
        moving.current = null;
        setDragging(null);
        if (live) push(draft.map((x, n) => (n === i ? live : x)));
        return;
      }
      const shape = textShape(ink, from, label);
      if (!shape)
        return setError("Type a label first, then tap the photo. Tap a label to move it.");
      setError(null);
      setPicked(draft.length);
      return push([...draft, shape]);
    }
    push([
      ...draft,
      shapeFromDrag(tool, ink, from, at(e)) ?? shapeAtTap(tool, ink, from, width / height),
    ]);
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg"
    >
      <div className="glass-bar sticky top-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center px-2 pt-[env(safe-area-inset-top)]">
        <Button
          type="button"
          kind="quiet"
          className="justify-self-start px-3 font-normal"
          onClick={async () => {
            if (!dirty || (await confirm(DISCARD_PROMPT))) onCancel();
          }}
        >
          Cancel
        </Button>
        <h2 className="font-sans text-[1.0625rem] font-semibold">{title}</h2>
        <Button
          type="button"
          kind="quiet"
          className="justify-self-end px-3"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const problem = await onSave(draft, caption);
            setSaving(false);
            if (problem) setError(problem);
          }}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      <div className="flex justify-center bg-navy p-2">
        <div
          className="relative touch-none select-none"
          style={{
            aspectRatio: `${width} / ${height}`,
            width: `min(100%, calc(60vh * ${width / height}))`,
          }}
          data-testid="markup-canvas"
          aria-label={`${canvasLabel}. ${tool === "pen" ? "Drag to draw." : "Tap to place, or drag to draw."}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = at(e);
            stroke.current = [at(e)];
            if (tool === "text") {
              const hit = textAt(at(e), e.currentTarget.getBoundingClientRect());
              moving.current = hit;
              setDragging(hit);
              if (hit !== null) setPicked(hit);
            }
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            if (tool === "text") {
              const i = moving.current;
              if (i === null) return;
              const p = at(e);
              const t = draft[i]!;
              // Follow the finger from where it took hold of the label.
              if (t.type === "text")
                setLive(
                  moveText(t, { x: t.x + p.x - start.current.x, y: t.y + p.y - start.current.y }),
                );
              return;
            }
            if (tool === "pen") {
              stroke.current.push(at(e));
              return setLive(penShape(ink, stroke.current));
            }
            setLive(shapeFromDrag(tool, ink, start.current, at(e)));
          }}
          onPointerUp={release}
          onPointerCancel={() => {
            start.current = null;
            stroke.current = [];
            moving.current = null;
            setDragging(null);
            setLive(null);
          }}
        >
          {background}
          <MarkupOverlay
            shapes={
              live && tool === "text" && dragging !== null
                ? draft.map((x, n) => (n === dragging ? live : x))
                : live
                  ? [...draft, live]
                  : draft
            }
            width={width}
            height={height}
          />
          {tool === "text" && selected !== null && !live ? (
            <SelectedText shape={draft[selected]!} width={width} height={height} unit={unit} />
          ) : null}
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <Segmented
          label="Tool"
          name="markup_tool"
          value={tool}
          onChange={setTool}
          options={[
            { value: "pen", label: "Pen" },
            { value: "arrow", label: "Arrow" },
            { value: "circle", label: "Circle" },
            { value: "text", label: "Text" },
          ]}
        />
        {tool === "text" ? (
          <>
            <Field
              label="Label"
              name="markup_label"
              value={label}
              maxLength={MARKUP_TEXT_MAX}
              placeholder="Crack"
              hint="Then tap the photo where it goes. Tap a label to select it; drag it to move it."
              onChange={(e) => setLabel(e.target.value)}
            />
            {selected !== null && draft[selected]?.type === "text" ? (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="font-medium">Size</span>
                  <input
                    type="range"
                    min={MARKUP_TEXT_SIZE_MIN}
                    max={MARKUP_TEXT_SIZE_MAX}
                    step={0.1}
                    value={(draft[selected] as { s?: number }).s ?? 1}
                    onChange={(e) => {
                      const next = resizeText(draft[selected]!, Number(e.target.value));
                      // One Undo step per selection's size change: replace the last step while
                      // the slider moves, if it was this same resize.
                      setHistory((h) => {
                        const last = h[h.length - 1]!;
                        const updated = last.map((x, n) => (n === selected ? next : x));
                        return resizing.current === selected
                          ? [...h.slice(0, -1), updated]
                          : [...h, updated];
                      });
                      resizing.current = selected;
                    }}
                    onPointerUp={() => (resizing.current = null)}
                    onKeyUp={() => (resizing.current = null)}
                    aria-label="Label size"
                    className="min-w-0 flex-1 accent-[var(--color-link)]"
                  />
                </label>
                <Button
                  type="button"
                  kind="quiet"
                  onClick={() => {
                    push(draft.filter((_, n) => n !== selected));
                    setPicked(null);
                  }}
                >
                  Delete Label
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-text-muted">
            {tool === "pen"
              ? "Drag to draw freehand."
              : `Tap to place ${tool === "arrow" ? "an arrow" : "a circle"}, or drag to draw one.`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Color" className="flex gap-2">
            {MARKUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={ink === c}
                aria-label={COLOR_NAMES[c]}
                onClick={() => setInk(c)}
                className="flex size-11 items-center justify-center rounded-full"
              >
                <span
                  className={cx(
                    "size-8 rounded-full border-2",
                    ink === c
                      ? "border-text ring-2 ring-text ring-offset-2"
                      : "border-control-border",
                  )}
                  style={{ backgroundColor: tokens.color.markup[c] }}
                />
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <Button
            type="button"
            kind="quiet"
            disabled={history.length < 2}
            onClick={() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))}
          >
            Undo
          </Button>
          <Button type="button" kind="quiet" disabled={draft.length === 0} onClick={() => push([])}>
            Clear All
          </Button>
        </div>
        {savedCaption !== undefined ? (
          <div data-autosave={onCaptionSave ? "" : undefined}>
            <Field
              label="Caption (optional)"
              name="caption"
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                if (onCaptionSave) captionSave.change(e.target.value.trim());
              }}
              onBlur={() => void captionSave.flush()}
            />
            {onCaptionSave ? <SavedNote status={captionSave.status} className="block" /> : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-status-fail">
            {error}
          </p>
        ) : null}
      </div>
      {confirmSheet}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

/** Uploads a drawn signature and records it on the job (the web's sign-off and sheet). */
export async function uploadSignature(input: {
  jobId: string;
  purpose: SignaturePurpose;
  strokes: SignatureStroke[];
  name: string;
  role: string;
}): Promise<void> {
  const svg = new Blob([signatureSvg(input.strokes)], { type: "image/svg+xml" });
  const start = await startUpload({ jobId: input.jobId, kind: "signature", mime: "image/svg+xml" });
  if (!start.ok) throw new Error(start.error);
  const put = await fetch(start.value.url, {
    method: "PUT",
    headers: { "content-type": "image/svg+xml", "x-upsert": "false" },
    body: svg,
  });
  if (!put.ok) throw await putError(put);
  const where = await position();
  const done = await finishSignature({
    id: start.value.id,
    jobId: input.jobId,
    path: start.value.path,
    purpose: input.purpose,
    signerName: input.name,
    signerRole: input.role,
    latitude: where?.latitude ?? null,
    longitude: where?.longitude ?? null,
  });
  if (!done.ok) throw new Error(done.error);
}

/**
 * The customer's sign-off (apple-design: sheets.md, modality.md). The tech hands the phone
 * over: a full-screen sheet with one task, the statement in plain words, the customer's
 * name already filled in, and a large box to sign. Cancel always gets out.
 */
export function SignatureForm({
  jobId,
  purposes,
  signer,
  shop,
  address,
  signed,
}: {
  jobId: string;
  purposes: { value: SignaturePurpose; label: string }[];
  signer: string;
  shop: string;
  address: string | null;
  /** Purposes already signed on this job, so the next one is offered first. */
  signed: string[];
}) {
  const first = purposes.find((p) => !signed.includes(p.value)) ?? purposes[0];
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<SignaturePurpose | "">(first?.value ?? "");
  const [name, setName] = useState(signer);
  const [role, setRole] = useState("");
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (purposes.length === 0) return null;

  async function save() {
    if (!purpose) return setError("Choose what this signature is for.");
    if (!name.trim()) return setError("Enter your name.");
    if (inkLength(strokes) < MIN_INK) return setError("Sign in the box with your finger.");
    setSaving(true);
    setError(null);
    try {
      await uploadSignature({ jobId, purpose, strokes, name, role });
      setStrokes([]);
      setRole("");
      setOpen(false);
      setSaved(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  const statement = purpose ? signatureStatement(purpose, shop, address) : "";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          kind="secondary"
          onClick={() => {
            setOpen(true);
            setSaved(false);
            setError(null);
          }}
        >
          Hand to Customer to Sign
        </Button>
        {saved ? (
          <span role="status" className="text-status-pass">
            Signature saved.
          </span>
        ) : null}
      </div>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sign-title"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg pb-[env(safe-area-inset-bottom)]"
        >
          <div className="glass sticky top-0 z-10 flex items-center justify-between rounded-none border-x-0 border-t-0 px-2 py-1">
            <Button type="button" kind="quiet" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <p className="text-[0.9375rem] font-semibold text-text-muted">{shop}</p>
            <span className="w-20" aria-hidden="true" />
          </div>
          <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 pt-5 pb-6">
            <div>
              <p className="text-[0.9375rem] font-semibold text-text-muted">
                {purposes.find((p) => p.value === purpose)?.label ?? "Signature"}
              </p>
              <h2 id="sign-title" className="font-display text-3xl font-extrabold">
                Please Sign
              </h2>
            </div>
            {purposes.length > 1 ? (
              <Segmented
                label="Signing for"
                name="purpose"
                value={purpose}
                onChange={setPurpose}
                options={purposes}
              />
            ) : null}
            <p className="text-[1.1875rem] leading-relaxed">{statement}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Your name"
                name="signer_name"
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
              <Field
                label="Role (optional)"
                name="signer_role"
                value={role}
                placeholder="Homeowner, property manager…"
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
            <SignaturePad strokes={strokes} onChange={setStrokes} />
            {error ? (
              <p role="alert" className="text-status-fail">
                {error}
              </p>
            ) : null}
          </div>
          <div className="glass sticky bottom-0 rounded-none border-x-0 border-b-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              disabled={saving}
              onClick={save}
              className="mx-auto flex w-full max-w-2xl"
            >
              {saving ? "Saving…" : "Sign"}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function SignaturePad({
  strokes,
  onChange,
}: {
  strokes: SignatureStroke[];
  onChange: (s: SignatureStroke[]) => void;
}) {
  const drawing = useRef(false);
  const point = (e: PointerEvent<SVGSVGElement>): [number, number] => {
    const box = e.currentTarget.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="font-medium" id="signature-label">
          Sign here
        </p>
        <Button
          type="button"
          kind="quiet"
          disabled={strokes.length === 0}
          onClick={() => onChange([])}
        >
          Clear
        </Button>
      </div>
      <svg
        role="img"
        aria-labelledby="signature-label"
        data-testid="signature-pad"
        className="h-[min(16rem,34vh)] w-full touch-none rounded-xl border-2 border-dashed border-control-border bg-paper"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          onChange([...strokes, [point(e)]]);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const last = strokes[strokes.length - 1] ?? [];
          onChange([...strokes.slice(0, -1), [...last, point(e)]]);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      >
        <g
          fill="none"
          stroke="#111111"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {strokes.map((s, i) => (
            <path key={i} d={strokePath(s)} />
          ))}
        </g>
      </svg>
      <p className="text-[0.9375rem] text-text-muted">Use your finger, or a mouse on a computer.</p>
    </div>
  );
}
