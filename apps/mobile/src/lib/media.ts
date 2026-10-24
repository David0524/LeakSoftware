import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  MEDIA_LIMITS,
  TEXT_PICTURE_LIMITS,
  extensionForMime,
  fitWithin,
  mimeFromFileName,
  type MediaKind,
} from "@leakbook/core";
import type { FileSource } from "@leakbook/sync";

/**
 * Captured files live in the app's documents folder as media/{id}.{ext}. Paths are stored
 * relative to it: on iOS the absolute container path changes when the app is updated.
 */
const FOLDER = "media";
/** Supabase's per-file upload limit on the current plan. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export class MediaError extends Error {
  constructor(
    message: string,
    /** The fix is in the phone's Settings (a permission was turned off). */
    readonly needsSettings = false,
  ) {
    super(message);
  }
}

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function relativeMediaPath(mediaId: string, mime: string): string {
  return `${FOLDER}/${mediaId}.${extensionForMime(mime)}`;
}

function mediaFile(relativePath: string): File {
  return new File(Paths.document, relativePath);
}

/** The local copy of a capture, if this phone has it. */
export function localMediaUri(mediaId: string, mime: string | null): string | null {
  if (!mime) return null;
  try {
    const f = mediaFile(relativeMediaPath(mediaId, mime));
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

/** Saves a signature drawing as media/signature-{id}.svg; returns its relative path. */
export function storeSignatureSvg(id: string, svg: string): string {
  const relativePath = `${FOLDER}/signature-${id}.svg`;
  folder();
  const f = mediaFile(relativePath);
  if (!f.exists) f.create();
  f.write(svg);
  return relativePath;
}

/** Remove every captured file (sign-out). */
export function deleteAllMedia() {
  const dir = new Directory(Paths.document, FOLDER);
  if (dir.exists) dir.delete();
}

/** Reads queued files in chunks for the resumable uploader. */
export const fileSource: FileSource = {
  async size(path) {
    const f = mediaFile(path);
    if (!f.exists) throw new MediaError(`The file for this capture is missing (${path})`);
    return f.size ?? 0;
  },
  async read(path, offset, length) {
    const handle = mediaFile(path).open();
    try {
      handle.offset = offset;
      return handle.readBytes(length);
    } finally {
      handle.close();
    }
  },
};

async function sha256(file: File): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Location: best effort, never blocks a capture
// ---------------------------------------------------------------------------

export async function askLocationOnce(): Promise<void> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.status === "undetermined" && p.canAskAgain)
      await Location.requestForegroundPermissionsAsync();
  } catch {
    // Location is optional.
  }
}

export async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.status !== "granted") return null;
    const last = await Location.getLastKnownPositionAsync({
      maxAge: 5 * 60_000,
      requiredAccuracy: 200,
    });
    const pos =
      last ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
      ]));
    return pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface CapturedFile {
  kind: MediaKind;
  /** Temporary file to move into the media folder. */
  uri: string;
  mime: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  capturedAt: string;
}

/** Open the camera. Returns null if the tech backs out. */
export async function captureWithCamera(kind: "photo" | "video"): Promise<CapturedFile | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted)
    throw new MediaError("Camera access is off. Turn it on in Settings, then try again.", true);
  const capturedAt = new Date().toISOString();
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: kind === "photo" ? ["images"] : ["videos"],
    quality: 1,
    exif: false,
    videoMaxDuration: MEDIA_LIMITS.videoMaxSeconds,
    // Medium keeps a full minute well under the upload limit (see DECISIONS).
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  if (result.canceled || !result.assets[0]) return null;
  return prepareCapture(kind, result.assets[0], capturedAt);
}

/** "2026:10:13 09:15:22" (EXIF, the phone's local time) as an ISO time, or null. */
function exifTime(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTime;
  const m = typeof raw === "string" && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/.exec(raw);
  if (!m) return null;
  const t = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}`);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/**
 * Pick a photo or video already on the phone (the camera roll). Its capture time comes from
 * the photo itself when it has one. Videos over the limit are refused, as when recording.
 */
export async function chooseFromLibrary(
  kind: "photo" | "video",
  /** A photo's long edge and JPEG quality; job photos by default (MEDIA_LIMITS). */
  photo: { longEdge: number; quality: number } = {
    longEdge: MEDIA_LIMITS.photoLongEdge,
    quality: MEDIA_LIMITS.photoQuality,
  },
): Promise<CapturedFile | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: kind === "photo" ? ["images"] : ["videos"],
    quality: 1,
    exif: kind === "photo",
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (kind === "video" && (asset.duration ?? 0) > (MEDIA_LIMITS.videoMaxSeconds + 1) * 1000)
    throw new MediaError(`Videos can be up to ${MEDIA_LIMITS.videoMaxSeconds} seconds.`);
  return prepareCapture(kind, asset, exifTime(asset.exif) ?? new Date().toISOString(), photo);
}

/**
 * A picture for a text, shrunk like the iPhone app and the website do (core
 * TEXT_PICTURE_LIMITS: long edge 2048 px, JPEG at 0.8), so it stays well under the texts
 * bucket's 10 MB and the carriers' 5 MB.
 */
export function chooseTextPicture(): Promise<CapturedFile | null> {
  return chooseFromLibrary("photo", TEXT_PICTURE_LIMITS);
}

/** Photos picked from the library at once (owner, 2026-10-22); the iPhone app's is the same. */
export const LIBRARY_PHOTO_LIMIT = 20;

/**
 * Several photos from the library at once (owner, 2026-10-22: "you need to be able to select
 * multiple photos at once"), in the order picked, each with its own capture time; one video.
 * Empty when the tech backs out.
 */
export async function chooseManyFromLibrary(kind: "photo" | "video"): Promise<CapturedFile[]> {
  if (kind === "video") {
    const one = await chooseFromLibrary("video");
    return one ? [one] : [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    exif: true,
    allowsMultipleSelection: true,
    selectionLimit: LIBRARY_PHOTO_LIMIT,
    orderedSelection: true,
  });
  if (result.canceled) return [];
  const files: CapturedFile[] = [];
  for (const asset of result.assets) {
    files.push(
      await prepareCapture("photo", asset, exifTime(asset.exif) ?? new Date().toISOString()),
    );
  }
  return files;
}

/**
 * Android can close the app while the camera or the library is open (low memory); the photo or
 * video the tech took is then handed back on the next start (owner request, 2026-10-20). Null
 * when there's nothing to recover (any other platform, Cancel, an error).
 */
export async function recoverCapture(
  kind: "photo" | "video",
  source: "camera" | "library",
): Promise<CapturedFile | null> {
  const result = await ImagePicker.getPendingResultAsync();
  if (!result || "code" in result || result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  if (kind === "video" && (asset.duration ?? 0) > (MEDIA_LIMITS.videoMaxSeconds + 1) * 1000)
    return null;
  const capturedAt =
    (source === "library" ? exifTime(asset.exif) : null) ?? new Date().toISOString();
  return prepareCapture(kind, asset, capturedAt);
}

async function prepareCapture(
  kind: "photo" | "video",
  asset: ImagePicker.ImagePickerAsset,
  capturedAt: string,
  photo: { longEdge: number; quality: number } = {
    longEdge: MEDIA_LIMITS.photoLongEdge,
    quality: MEDIA_LIMITS.photoQuality,
  },
): Promise<CapturedFile> {
  if (kind === "video") {
    return {
      kind,
      uri: asset.uri,
      mime: asset.mimeType ?? mimeFromFileName(asset.fileName ?? asset.uri, "video"),
      width: asset.width || null,
      height: asset.height || null,
      durationMs: asset.duration ? Math.round(asset.duration) : null,
      capturedAt,
    };
  }

  // Photos: long edge 2048 px, JPEG 0.7 (0.8 for texts). Also turns HEIC into JPEG and drops
  // EXIF.
  const ctx = ImageManipulator.manipulate(asset.uri);
  const size = fitWithin(asset.width, asset.height, photo.longEdge);
  if (size) ctx.resize(size);
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({
    compress: photo.quality,
    format: SaveFormat.JPEG,
  });
  return {
    kind,
    uri: saved.uri,
    mime: "image/jpeg",
    width: saved.width,
    height: saved.height,
    durationMs: null,
    capturedAt,
  };
}

export interface StoredFile {
  id: string;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Move a capture into the media folder under its media id and fingerprint it. The file is
 * never changed after this: markup is stored separately.
 */
export async function storeCapture(id: string, captured: CapturedFile): Promise<StoredFile> {
  folder();
  const relativePath = relativeMediaPath(id, captured.mime);
  const dest = mediaFile(relativePath);
  new File(captured.uri).move(dest);
  const sizeBytes = dest.size ?? 0;
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    dest.delete();
    throw new MediaError(
      captured.kind === "video"
        ? "That video is too large to upload. Record a shorter clip."
        : "That file is too large to upload.",
    );
  }
  return { id, relativePath, sizeBytes, sha256: await sha256(dest) };
}

/** Voice notes are AAC in an .m4a container (expo-audio's high-quality preset). */
export const VOICE_MIME = "audio/mp4";
