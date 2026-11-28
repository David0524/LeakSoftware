"use client";

import { useRef, useState, useTransition } from "react";
import { TECH_CARD_TEXT } from "@leakbook/core";
import { saveMemberPhoto } from "@/app/actions/member-photo";
import { TechPhoto } from "./tech-photo";
import { Button } from "./ui";

/** A picked photo, cropped square from its middle and saved as a 512 px JPEG. */
async function squareJpeg(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(TECH_CARD_TEXT.size, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
    return await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  } catch {
    return null;
  }
}

/**
 * A member's photo with Add Photo / Change Photo / Remove Photo (2026-11-26): Settings › Team
 * (owners and admins, anyone) and More › My Profile (yourself). Saves at once, as iOS does.
 */
export function TechPhotoPicker({
  memberId,
  url,
  name,
  color,
  label = TECH_CARD_TEXT.photo,
  footer,
}: {
  memberId: string;
  url: string | null;
  name: string;
  color: string | null;
  label?: string;
  footer?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(url);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(photo: Blob | null) {
    const form = new FormData();
    form.set("member", memberId);
    if (photo) form.set("photo", new File([photo], "photo.jpg", { type: "image/jpeg" }));
    else form.set("remove", "1");
    start(async () => {
      const result = await saveMemberPhoto({}, form);
      setError(result.error ?? null);
      if (!result.error) setPreview(photo ? URL.createObjectURL(photo) : null);
    });
  }

  return (
    <section aria-label={label} data-testid="tech-photo-picker">
      <ul className="grouped">
        <li className="flex min-h-11 items-center gap-3 px-4 py-2">
          <TechPhoto url={preview} name={name} color={color} size={56} />
          <span className="min-w-0 flex-1 font-medium">{label}</span>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              kind="secondary"
              disabled={pending}
              onClick={() => input.current?.click()}
            >
              {preview ? TECH_CARD_TEXT.changePhoto : TECH_CARD_TEXT.addPhoto}
            </Button>
            {preview ? (
              <Button type="button" kind="danger" disabled={pending} onClick={() => save(null)}>
                {TECH_CARD_TEXT.removePhoto}
              </Button>
            ) : null}
          </div>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            className="hidden"
            aria-label={label}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const photo = await squareJpeg(file);
              if (!photo) {
                setError("Couldn’t read that photo. Try a JPEG or PNG.");
                return;
              }
              save(photo);
            }}
          />
        </li>
      </ul>
      {footer ? (
        <p className="px-4 pt-2 text-[0.9375rem] text-text-muted sm:px-0">{footer}</p>
      ) : null}
      {error ? (
        <p role="alert" className="px-4 pt-1 text-[0.9375rem] text-status-fail sm:px-0">
          {error}
        </p>
      ) : null}
    </section>
  );
}
