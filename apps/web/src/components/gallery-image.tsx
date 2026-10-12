"use client";

import { useState } from "react";
import type { MarkupShape } from "@leakbook/core";
import { MarkupOverlay } from "./markup";

/** A gallery photo with its markup; falls back to a message if the file can't load. */
export function GalleryImage({
  url,
  alt,
  width,
  height,
  shapes,
}: {
  url: string;
  alt: string;
  width: number;
  height: number;
  shapes: MarkupShape[];
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-bg p-4 text-center text-text-muted">
        Couldn’t load this photo.
        <a href={url} target="_blank" rel="noreferrer" className="text-link underline">
          Open the original
        </a>
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="relative block bg-navy">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
      <img
        src={url}
        alt={alt}
        width={width}
        height={height}
        className="h-auto w-full"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <MarkupOverlay shapes={shapes} width={width} height={height} />
    </a>
  );
}
