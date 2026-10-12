import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  MEDIA_LIMITS,
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
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export class MediaError extends Error {}

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function relativeMediaPath(mediaId: string, mime: string): string {
  return `${FOLDER}/${mediaId}.${extensionForMime(mime)}`;
}

export function mediaFile(relativePath: string): File {
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
    throw new MediaError("Camera access is off. Turn it on in Settings, then try again.");
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
  const asset = result.assets[0];

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

  // Photos: long edge 2048 px, JPEG 0.7. Also turns HEIC into JPEG and drops EXIF.
  const ctx = ImageManipulator.manipulate(asset.uri);
  const size = fitWithin(asset.width, asset.height, MEDIA_LIMITS.photoLongEdge);
  if (size) ctx.resize(size);
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({
    compress: MEDIA_LIMITS.photoQuality,
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
