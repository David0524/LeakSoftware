// Photos, videos, and voice notes (BUILD_PLAN 4.5). Originals are evidence: they are
// never edited. Markup is vector data stored on the media row and drawn on top.

export type MediaKind = "photo" | "video" | "audio";

export interface Media {
  id: string;
  company_id: string;
  job_id: string;
  finding_id: string | null;
  job_component_id: string | null;
  test_result_id: string | null;
  kind: MediaKind;
  storage_path: string | null;
  upload_state: "pending" | "uploaded";
  mime_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  captured_at: string | null;
  latitude: number | null;
  longitude: number | null;
  markup: Markup | null;
  caption: string | null;
  transcript: string | null;
  transcript_status: "none" | "pending" | "done" | "failed";
  created_at: string;
}

/** Capture settings. Photos are resized on the device; videos use the camera's medium preset. */
export const MEDIA_LIMITS = {
  photoLongEdge: 2048,
  photoQuality: 0.7,
  videoMaxSeconds: 60,
  voiceMaxSeconds: 300,
} as const;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

export function extensionForMime(mime: string): string {
  const ext = EXTENSIONS[mime.toLowerCase()];
  if (!ext) throw new Error(`Unsupported media type: ${mime}`);
  return ext;
}

/** Guess a MIME type from a file name, for pickers that do not report one. */
export function mimeFromFileName(name: string, kind: MediaKind): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const found = Object.entries(EXTENSIONS).find(([, e]) => e === ext);
  if (found) return found[0];
  return kind === "photo" ? "image/jpeg" : kind === "video" ? "video/mp4" : "audio/mp4";
}

/** Object path inside the `media` bucket. The first folder is the company (storage RLS). */
export function mediaStoragePath(
  companyId: string,
  jobId: string,
  mediaId: string,
  mime: string,
): string {
  return `${companyId}/${jobId}/${mediaId}.${extensionForMime(mime)}`;
}

/** Size that fits within `maxEdge` on the long side, or null when no resize is needed. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } | null {
  const long = Math.max(width, height);
  if (long <= maxEdge || long === 0) return null;
  const scale = maxEdge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export function formatDuration(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  const b = bytes ?? 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Pictures in texts are shrunk before they're sent, like job photos but a little sharper (MMS
 * shows them full screen): long edge 2048 px, JPEG at 0.8. A 48 MP photo then comes to about
 * 1 MB, well under the texts bucket's 10 MB and the carriers' 5 MB a message. GIFs are sent as
 * they are, so they keep moving.
 */
export const TEXT_PICTURE_LIMITS = { longEdge: 2048, quality: 0.8 } as const;

/**
 * What each storage bucket takes (security review M2; the buckets' file_size_limit and
 * allowed_mime_types, 20261022002500_upload_limits.sql). The apps check these before
 * uploading; the storage server refuses anything past them.
 */
export const UPLOAD_LIMITS = {
  /** Photos (2048 px JPEG), 60-second medium-quality videos, voice notes, signatures. */
  media: 50 * 1024 * 1024,
  /** Pictures in texts: a phone's full-size JPEG, or what a customer's carrier sends (5 MB). */
  texts: 10 * 1024 * 1024,
  /** Shop logos. */
  logo: 2 * 1024 * 1024,
} as const;

export type UploadBucket = keyof typeof UPLOAD_LIMITS;

/** Why the storage server refused an upload, when it's one a person can fix. */
export type UploadRefusal = "too_large" | "wrong_type" | "read_only";

/**
 * Reads a refusal from the storage server's status and message (TUS, a signed upload URL, or
 * supabase-js): 413 too large, 415 a type the bucket doesn't take, or the row rule that keeps
 * a read-only shop from adding files. Null for anything else (offline, a server error).
 */
export function uploadRefusal(
  status: number | string | null | undefined,
  message: string | null | undefined,
): UploadRefusal | null {
  const code = Number(status);
  const text = message ?? "";
  if (code === 413 || /maximum allowed size|too large|maximum size exceeded/i.test(text))
    return "too_large";
  if (code === 415 || /mime type|invalid_mime_type|invalidmimetype/i.test(text))
    return "wrong_type";
  if (/row-level security/i.test(text)) return "read_only";
  return null;
}

/** The message for a refused upload, in the same words on every platform. */
export function uploadRefusalMessage(refusal: UploadRefusal, bucket: UploadBucket): string {
  if (refusal === "read_only")
    return "This shop is read-only until the subscription is paid, so files can’t be added yet.";
  if (bucket === "logo")
    return refusal === "too_large" ? "Use a file under 2 MB." : "Use a PNG, JPEG, or SVG file.";
  if (bucket === "texts")
    return refusal === "too_large"
      ? "That picture is too large to send. Each one can be up to 10 MB."
      : "Send photos (JPEG, PNG, or HEIC).";
  return refusal === "too_large"
    ? "That file is too large to upload (50 MB at most). For a video, record a shorter clip."
    : "That type of file can’t be uploaded. Use a photo (JPEG, PNG, or HEIC), a video (MP4 or MOV), or a voice note.";
}

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  photo: "Photo",
  video: "Video",
  audio: "Voice Note",
};

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

/** Annotation colors. Values live in brand/tokens.json (color.markup). */
export type MarkupColor = "red" | "yellow" | "white";
export const MARKUP_COLORS: MarkupColor[] = ["red", "yellow", "white"];

/**
 * Coordinates are fractions (0..1) of the image width (x) and height (y), so markup lines
 * up at any display size, on the phone, the office view, and the PDF.
 */
export type MarkupShape =
  | { type: "arrow"; color: MarkupColor; x1: number; y1: number; x2: number; y2: number }
  | { type: "circle"; color: MarkupColor; cx: number; cy: number; rx: number; ry: number }
  /**
   * Text centered on (x, y). `s` is its size (owner, 2026-10-20: "adjust text location and
   * size"): 1 is the standard size, from MARKUP_TEXT_SIZE_MIN to MARKUP_TEXT_SIZE_MAX.
   */
  | { type: "text"; color: MarkupColor; x: number; y: number; text: string; s?: number }
  /** Freehand (owner, 2026-10-19: "Mark up should have a pen"): points as 0..1 [x, y]. */
  | { type: "pen"; color: MarkupColor; points: [number, number][] };

/** The most points one pen stroke keeps (after thinning). */
export const PEN_POINTS_MAX = 400;

export interface Markup {
  version: 1;
  shapes: MarkupShape[];
}

export const EMPTY_MARKUP: Markup = { version: 1, shapes: [] };
export const MARKUP_TEXT_MAX = 80;
export const MARKUP_TEXT_SIZE_MIN = 0.5;
export const MARKUP_TEXT_SIZE_MAX = 3;

/** A text size kept within bounds, to two decimals; 1 for anything that isn't a number. */
export function clampTextSize(s: unknown): number {
  const n = typeof s === "number" && Number.isFinite(s) ? s : 1;
  return Math.round(Math.min(MARKUP_TEXT_SIZE_MAX, Math.max(MARKUP_TEXT_SIZE_MIN, n)) * 100) / 100;
}

const isUnit = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 1;
const isColor = (v: unknown): v is MarkupColor => MARKUP_COLORS.includes(v as MarkupColor);

function validShape(s: unknown): MarkupShape | null {
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  if (!isColor(o.color)) return null;
  switch (o.type) {
    case "arrow":
      return isUnit(o.x1) && isUnit(o.y1) && isUnit(o.x2) && isUnit(o.y2)
        ? { type: "arrow", color: o.color, x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 }
        : null;
    case "circle":
      return isUnit(o.cx) && isUnit(o.cy) && isUnit(o.rx) && isUnit(o.ry)
        ? { type: "circle", color: o.color, cx: o.cx, cy: o.cy, rx: o.rx, ry: o.ry }
        : null;
    case "pen": {
      if (!Array.isArray(o.points)) return null;
      const points = o.points
        .filter((p): p is [number, number] => Array.isArray(p) && isUnit(p[0]) && isUnit(p[1]))
        .slice(0, PEN_POINTS_MAX)
        .map(([x, y]) => [x, y] as [number, number]);
      return points.length >= 2 ? { type: "pen", color: o.color, points } : null;
    }
    case "text": {
      const text = typeof o.text === "string" ? o.text.trim().slice(0, MARKUP_TEXT_MAX) : "";
      if (!isUnit(o.x) || !isUnit(o.y) || !text) return null;
      const size = clampTextSize(o.s);
      return size === 1
        ? { type: "text", color: o.color, x: o.x, y: o.y, text }
        : { type: "text", color: o.color, x: o.x, y: o.y, text, s: size };
    }
    default:
      return null;
  }
}

/** Read markup from a synced row. Anything unrecognized is dropped, never thrown. */
export function parseMarkup(value: unknown): Markup {
  if (!value || typeof value !== "object") return EMPTY_MARKUP;
  const shapes = (value as { shapes?: unknown }).shapes;
  if (!Array.isArray(shapes)) return EMPTY_MARKUP;
  return { version: 1, shapes: shapes.map(validShape).filter((s) => s !== null) };
}

const clampUnit = (v: number) => Math.round(Math.min(Math.max(v, 0), 1) * 10000) / 10000;

/** Build a shape from a drag gesture (start and end as fractions of the image). */
export function shapeFromDrag(
  type: "arrow" | "circle",
  color: MarkupColor,
  start: { x: number; y: number },
  end: { x: number; y: number },
): MarkupShape | null {
  const a = { x: clampUnit(start.x), y: clampUnit(start.y) };
  const b = { x: clampUnit(end.x), y: clampUnit(end.y) };
  // Ignore taps and tiny drags: 2% of the image in both directions.
  if (Math.abs(a.x - b.x) < 0.02 && Math.abs(a.y - b.y) < 0.02) return null;
  if (type === "arrow") return { type, color, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  return {
    type,
    color,
    cx: clampUnit((a.x + b.x) / 2),
    cy: clampUnit((a.y + b.y) / 2),
    rx: clampUnit(Math.max(Math.abs(a.x - b.x) / 2, 0.01)),
    ry: clampUnit(Math.max(Math.abs(a.y - b.y) / 2, 0.01)),
  };
}

/**
 * A pen stroke from the points of a drag (fractions of the image). Points closer than 0.4% of
 * the image to the last kept one are dropped, so a stroke stays small. Null for a tap.
 */
export function penShape(
  color: MarkupColor,
  points: { x: number; y: number }[],
): MarkupShape | null {
  const kept: [number, number][] = [];
  for (const p of points) {
    const q: [number, number] = [clampUnit(p.x), clampUnit(p.y)];
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.004) kept.push(q);
  }
  if (kept.length < 2) return null;
  // Too long: keep every nth point, and always the last.
  const step = Math.ceil(kept.length / PEN_POINTS_MAX);
  const thin = step > 1 ? kept.filter((_, i) => i % step === 0 || i === kept.length - 1) : kept;
  return { type: "pen", color, points: thin.slice(0, PEN_POINTS_MAX) };
}

/** An SVG path for a pen stroke in a width x height space. */
export function penPath(points: [number, number][], width: number, height: number): string {
  return points
    .map(
      ([x, y], i) =>
        `${i ? "L" : "M"}${Math.round(x * width * 10) / 10} ${Math.round(y * height * 10) / 10}`,
    )
    .join(" ");
}

export function textShape(
  color: MarkupColor,
  at: { x: number; y: number },
  text: string,
): MarkupShape | null {
  return validShape({ type: "text", color, x: clampUnit(at.x), y: clampUnit(at.y), text });
}

/** A text label moved to `at` (dragged), kept on the photo. Other shapes come back unchanged. */
export function moveText(shape: MarkupShape, at: { x: number; y: number }): MarkupShape {
  if (shape.type !== "text") return shape;
  return validShape({ ...shape, x: clampUnit(at.x), y: clampUnit(at.y) }) ?? shape;
}

/** A text label at a new size (pinched, or the size control), kept within bounds. */
export function resizeText(shape: MarkupShape, size: number): MarkupShape {
  if (shape.type !== "text") return shape;
  return validShape({ ...shape, s: clampTextSize(size) }) ?? shape;
}

/** Arrow head points (in display pixels) for an arrow from (x1,y1) to (x2,y2). */
export function arrowHead(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
): [number, number][] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  return [
    [x2, y2],
    [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
    [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)],
  ];
}

/**
 * How a markup arrow is drawn (owner, 2026-10-19: "the mockup arrow looks strange"): a wider
 * head, and a shaft that stops inside the head, so the head's point stays sharp instead of the
 * round end of a thick line poking through it. `unit` is the drawing's width / 400.
 */
export function arrowShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  unit: number,
): { shaftEnd: [number, number]; head: [number, number][] } {
  const size = Math.max(14, 30 * unit);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 6;
  const length = Math.hypot(x2 - x1, y2 - y1);
  // The shaft ends 60% of the way into the head (never behind where it starts).
  const back = Math.min(size * 0.6, length);
  return {
    shaftEnd: [x2 - back * Math.cos(angle), y2 - back * Math.sin(angle)],
    head: [
      [x2, y2],
      [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)],
      [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)],
    ],
  };
}

/**
 * A default shape for a tap (no drag): a circle around the tap, or an arrow pointing at it
 * from up and to the left (from the other side when the tap is near that edge).
 * `aspect` is the photo's width / height, so the circle is round on screen.
 */
export function shapeAtTap(
  type: "arrow" | "circle",
  color: MarkupColor,
  at: { x: number; y: number },
  aspect: number,
): MarkupShape {
  const x = clampUnit(at.x);
  const y = clampUnit(at.y);
  const dx = 0.15;
  const dy = 0.15 * aspect;
  if (type === "circle") {
    return { type, color, cx: x, cy: y, rx: 0.08, ry: clampUnit(0.08 * aspect) };
  }
  const x1 = x - dx >= 0 ? x - dx : x + dx;
  const y1 = y - dy >= 0 ? y - dy : y + dy;
  return { type, color, x1: clampUnit(x1), y1: clampUnit(y1), x2: x, y2: y };
}
