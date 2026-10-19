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
  | { type: "text"; color: MarkupColor; x: number; y: number; text: string }
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
      return isUnit(o.x) && isUnit(o.y) && text
        ? { type: "text", color: o.color, x: o.x, y: o.y, text }
        : null;
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
