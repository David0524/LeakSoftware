import sharp from "sharp";

// Report PDFs embed every image at the size the page loads it. Photos arrive as phone
// originals (1536 x 2048 and up) but print about 3 to 5 inches wide, so a PDF carried
// ~400 dpi it could never show. The PDF render path shrinks what Chromium loads; the stored
// originals are never touched (sent reports and original photos are immutable).

/** Longest edge for a photo: ~225 dpi at the usual 3.6 x 4.8 in, ~170 dpi at a full-width 6.5 in. */
export const PRINT_PHOTO_EDGE = 1100;
/** A logo prints about an inch wide. */
export const PRINT_LOGO_EDGE = 600;
export const PRINT_JPEG_QUALITY = 78;

/**
 * The image shrunk for print: photos become JPEGs (quality 78, longest edge 1300), images with
 * transparency (logos) stay PNGs (longest edge 600). Returns null when the bytes aren't an
 * image sharp can read, an SVG, or when shrinking wouldn't make the file smaller.
 */
export async function shrinkForPrint(
  input: Buffer,
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const meta = await sharp(input).metadata();
    if (!meta.format || meta.format === "svg" || meta.format === "gif") return null;
    // Animated or multi-frame images are left alone.
    if ((meta.pages ?? 1) > 1) return null;
    // `rotate()` bakes the EXIF orientation in, so the result looks the same without it.
    const base = sharp(input).rotate();
    const out = meta.hasAlpha
      ? {
          body: await base
            .resize(PRINT_LOGO_EDGE, PRINT_LOGO_EDGE, { fit: "inside", withoutEnlargement: true })
            .png({ palette: true, compressionLevel: 9 })
            .toBuffer(),
          contentType: "image/png",
        }
      : {
          body: await base
            .resize(PRINT_PHOTO_EDGE, PRINT_PHOTO_EDGE, { fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: PRINT_JPEG_QUALITY, mozjpeg: true })
            .toBuffer(),
          contentType: "image/jpeg",
        };
    return out.body.length < input.length ? out : null;
  } catch {
    return null;
  }
}
