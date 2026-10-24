import { fitWithin, TEXT_PICTURE_LIMITS } from "@leakbook/core";

/**
 * A picture for a text, shrunk in the browser before it's sent (core TEXT_PICTURE_LIMITS: long
 * edge 2048 px, JPEG at 0.8), as the iPhone and Android apps do. GIFs, and pictures this browser
 * can't read (HEIC outside Safari), go as they are; the server's 5 MB check still applies.
 */
export async function shrinkTextPicture(file: File): Promise<File> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = fitWithin(bitmap.width, bitmap.height, TEXT_PICTURE_LIMITS.longEdge) ?? {
      width: bitmap.width,
      height: bitmap.height,
    };
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", TEXT_PICTURE_LIMITS.quality),
    );
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Every picture in the form, shrunk (shrinkTextPicture), in place. */
export async function shrinkTextPictures(data: FormData, field = "pictures"): Promise<void> {
  const files = data
    .getAll(field)
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 10);
  if (!files.length) return;
  const shrunk = await Promise.all(files.map(shrinkTextPicture));
  data.delete(field);
  for (const f of shrunk) data.append(field, f);
}
