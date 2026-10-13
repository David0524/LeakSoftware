"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  MARKUP_COLORS,
  MARKUP_TEXT_MAX,
  MEDIA_LIMITS,
  MIN_INK,
  fitWithin,
  formatDuration,
  inkLength,
  shapeAtTap,
  shapeFromDrag,
  signatureSvg,
  strokePath,
  textShape,
  type MarkupColor,
  type MarkupShape,
  type MediaKind,
  type SignaturePurpose,
  type SignatureStroke,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import {
  deleteMedia,
  finishSignature,
  finishUpload,
  saveMarkup,
  startUpload,
} from "@/app/actions/media";
import { MarkupOverlay } from "./markup";
import { Segmented } from "./segmented";
import { Button, Field, Select, buttonClass, cx } from "./ui";

// Photos, videos, voice notes, markup, and signatures from a browser (M9.5): the phone app's
// capture screens. Files go straight to storage; the server records them.

const MAX_BYTES = 50 * 1024 * 1024;

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
  if (!put.ok) throw new Error(`Upload failed (${put.status}). Try again.`);
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
  const [attachTo, setAttachTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function run(label: string, work: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ text: await work() });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : String(e), error: true });
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

  const pick = (accept: string, multiple = false) => ({
    type: "file" as const,
    accept,
    multiple,
    capture: "environment" as const,
    disabled: busy !== null,
    className: "sr-only",
  });

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
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
      <div className="flex flex-wrap gap-3">
        <label className={cx(buttonClass("secondary"), "cursor-pointer focus-within:outline-3")}>
          Add Photo
          <input
            {...pick("image/*", true)}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) addPhotos(files);
            }}
          />
        </label>
        <label className={cx(buttonClass("secondary"), "cursor-pointer focus-within:outline-3")}>
          Add Video
          <input
            {...pick("video/*")}
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
      <p aria-live="polite" className="text-[15px]">
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
        <Button type="button" kind="secondary" disabled={disabled} onClick={start}>
          Record Voice Note
        </Button>
        {error ? (
          <p role="alert" className="w-full text-[15px] text-status-fail">
            {error}
          </p>
        ) : null}
      </>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
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

export function MediaActions({
  jobId,
  media,
}: {
  jobId: string;
  media: {
    id: string;
    kind: MediaKind;
    url: string | null;
    width: number;
    height: number;
    shapes: MarkupShape[];
    caption: string | null;
    label: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-4">
        {media.kind === "photo" && media.url ? (
          <button
            type="button"
            className="min-h-11 font-semibold text-link underline-offset-4 hover:underline"
            onClick={() => setEditing(true)}
            aria-label={`${media.shapes.length ? "Edit Markup" : "Mark Up"}: ${media.label}`}
          >
            {media.shapes.length ? "Edit Markup" : "Mark Up"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          className="min-h-11 font-semibold text-status-fail underline-offset-4 hover:underline"
          aria-label={`Delete: ${media.label}`}
          onClick={async () => {
            if (!window.confirm("Remove this from the job? The original stays on file.")) return;
            setBusy(true);
            const r = await deleteMedia({ jobId, mediaId: media.id });
            setBusy(false);
            if (!r.ok) setError(r.error);
          }}
        >
          Delete
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-status-fail">
          {error}
        </p>
      ) : null}
      {editing && media.url ? (
        <MarkupEditor
          url={media.url}
          width={media.width}
          height={media.height}
          shapes={media.shapes}
          caption={media.caption ?? ""}
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

const COLOR_NAMES: Record<MarkupColor, string> = { red: "Red", yellow: "Yellow", white: "White" };
type Tool = "arrow" | "circle" | "text";

function MarkupEditor({
  url,
  width,
  height,
  shapes,
  caption: savedCaption,
  onCancel,
  onSave,
}: {
  url: string;
  width: number;
  height: number;
  shapes: MarkupShape[];
  caption: string;
  onCancel: () => void;
  onSave: (shapes: MarkupShape[], caption: string) => Promise<string | null>;
}) {
  const [history, setHistory] = useState<MarkupShape[][]>([shapes]);
  const draft = history[history.length - 1]!;
  const [live, setLive] = useState<MarkupShape | null>(null);
  const [tool, setTool] = useState<Tool>("circle");
  const [ink, setInk] = useState<MarkupColor>("red");
  const [label, setLabel] = useState("");
  const [caption, setCaption] = useState(savedCaption);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dirty = history.length > 1 || caption !== savedCaption;
  const push = (next: MarkupShape[]) => setHistory((h) => [...h, next]);

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  function release(e: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    start.current = null;
    setLive(null);
    if (!from) return;
    if (tool === "text") {
      const shape = textShape(ink, from, label);
      if (!shape) return setError("Type a label first, then tap the photo.");
      setError(null);
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
      aria-label="Mark Up"
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg"
    >
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-2">
        <Button
          type="button"
          kind="quiet"
          onClick={() => {
            if (!dirty || window.confirm("Discard markup changes?")) onCancel();
          }}
        >
          Cancel
        </Button>
        <h2 className="font-display text-lg font-bold">Mark Up</h2>
        <Button
          type="button"
          kind="quiet"
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
          aria-label="Photo. Tap to place, or drag to draw."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = at(e);
          }}
          onPointerMove={(e) => {
            if (start.current && tool !== "text")
              setLive(shapeFromDrag(tool, ink, start.current, at(e)));
          }}
          onPointerUp={release}
          onPointerCancel={() => {
            start.current = null;
            setLive(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
          <img src={url} alt="" className="block h-full w-full" draggable={false} />
          <MarkupOverlay shapes={live ? [...draft, live] : draft} width={width} height={height} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <Segmented
          label="Tool"
          name="markup_tool"
          value={tool}
          onChange={setTool}
          options={[
            { value: "arrow", label: "Arrow" },
            { value: "circle", label: "Circle" },
            { value: "text", label: "Text" },
          ]}
        />
        {tool === "text" ? (
          <Field
            label="Label"
            name="markup_label"
            value={label}
            maxLength={MARKUP_TEXT_MAX}
            placeholder="Crack"
            hint="Then tap the photo where it goes."
            onChange={(e) => setLabel(e.target.value)}
          />
        ) : (
          <p className="text-text-muted">
            Tap to place {tool === "arrow" ? "an arrow" : "a circle"}, or drag to draw one.
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
        <Field
          label="Caption (optional)"
          name="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />
        {error ? (
          <p role="alert" className="text-status-fail">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export function SignatureForm({
  jobId,
  purposes,
  signer,
}: {
  jobId: string;
  purposes: { value: SignaturePurpose; label: string }[];
  signer: string;
}) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<SignaturePurpose | "">(purposes[0]?.value ?? "");
  const [name, setName] = useState(signer);
  const [role, setRole] = useState("");
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (purposes.length === 0)
    return <p className="text-text-muted">Signatures are turned off in your company settings.</p>;
  if (!open)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          kind="secondary"
          onClick={() => {
            setOpen(true);
            setSaved(false);
          }}
        >
          Add Signature
        </Button>
        {saved ? <span className="text-status-pass">Signature saved.</span> : null}
      </div>
    );

  async function save() {
    if (!purpose) return setError("Choose what this signature is for.");
    if (!name.trim()) return setError("Enter the signer’s name.");
    if (inkLength(strokes) < MIN_INK) return setError("Ask them to sign in the box.");
    setSaving(true);
    setError(null);
    try {
      const svg = new Blob([signatureSvg(strokes)], { type: "image/svg+xml" });
      const start = await startUpload({ jobId, kind: "signature", mime: "image/svg+xml" });
      if (!start.ok) throw new Error(start.error);
      const put = await fetch(start.value.url, {
        method: "PUT",
        headers: { "content-type": "image/svg+xml", "x-upsert": "false" },
        body: svg,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}). Try again.`);
      const where = await position();
      const done = await finishSignature({
        id: start.value.id,
        jobId,
        path: start.value.path,
        purpose,
        signerName: name,
        signerRole: role,
        latitude: where?.latitude ?? null,
        longitude: where?.longitude ?? null,
      });
      if (!done.ok) throw new Error(done.error);
      setStrokes([]);
      setRole("");
      setOpen(false);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-4">
      <h3 className="font-display text-lg font-bold">Add Signature</h3>
      {purposes.length > 1 ? (
        <Segmented
          label="Signature for"
          name="purpose"
          value={purpose}
          onChange={setPurpose}
          options={purposes}
        />
      ) : (
        <p className="font-semibold">{purposes[0]!.label}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Signer’s name"
          name="signer_name"
          value={name}
          autoComplete="off"
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
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save Signature"}
        </Button>
        <Button type="button" kind="quiet" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SignaturePad({
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
          Signature
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
        className="h-48 w-full touch-none rounded-md border-2 border-dashed border-control-border bg-paper"
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
      <p className="text-[15px] text-text-muted">Sign with a finger, or a mouse on a computer.</p>
    </div>
  );
}
