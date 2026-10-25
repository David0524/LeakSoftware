import type { Metadata } from "next";
import { headers } from "next/headers";
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { cache } from "react";
import {
  linkPreview,
  linkPreviewVersion,
  type LinkPreview,
  type LinkPreviewKind,
  type LinkPreviewRow,
} from "@leakbook/core";
import { CARD_SIZE, LinkPreviewArt, fitLogo, type CardLogo } from "@/components/link-preview-card";
import { isLinkPreviewFetch } from "@/lib/link-preview-bots";
import { publicClient } from "@/server/reports";

/**
 * Link previews for quotes, invoices and reports (owner, 2026-10-24): the og tags on /q, /i and
 * /r, and the card image at /q/{token}/card.png (same for /i and /r). Built from
 * link_preview_for_token, which counts no view and returns only what the page itself shows.
 * Never Sundeck Pro's clip (lib/share-preview), which is for its own pages only.
 */

const PATH: Record<LinkPreviewKind, string> = { quote: "q", invoice: "i", report: "r" };
const TOKEN = /^[0-9a-f]{32}$/;

/** The link's preview fields, once per request (metadata and page share it). */
export const loadLinkPreview = cache(async (token: string): Promise<LinkPreviewRow | null> => {
  if (!TOKEN.test(token)) return null;
  // Only for a real request: Next also prerenders the page, and there the lookup's fetch is cut
  // off and its answer thrown away. This skips it, so the error below is always a real one.
  await connection();
  const { data, error } = await publicClient().rpc("link_preview_for_token", { link_token: token });
  if (error) {
    // The page still opens with its plain title, so say why the preview is missing. Never the
    // token: it opens the document.
    console.error(`link_preview_for_token failed: ${error.message}`);
    return null;
  }
  return (data as LinkPreviewRow | null) ?? null;
});

/** Where a link's card image lives; `v` changes whenever the card would. */
export function cardImagePath(kind: LinkPreviewKind, token: string, preview: LinkPreview): string {
  return `/${PATH[kind]}/${token}/card.png?v=${linkPreviewVersion(preview)}`;
}

/**
 * A customer page's metadata: its browser-tab title (unchanged), noindex, and the preview: the
 * card image, "{Shop}: Quote for {Customer}" and one plain line. No video.
 */
export async function documentMetadata(
  kind: LinkPreviewKind,
  token: string,
  tabTitle: string,
): Promise<Metadata> {
  const base: Metadata = { title: tabTitle, robots: { index: false } };
  const row = await loadLinkPreview(token);
  if (!row || row.kind !== kind) return base;
  const p = linkPreview(row);
  const image = {
    url: cardImagePath(kind, token, p),
    width: CARD_SIZE.width,
    height: CARD_SIZE.height,
    alt: p.alt,
    type: "image/png",
  };
  return {
    ...base,
    description: p.description,
    openGraph: {
      type: "website",
      url: `/${PATH[kind]}/${token}`,
      title: p.title,
      description: p.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: p.title,
      description: p.description,
      images: [image],
    },
  };
}

/** Whether this request is a link-preview fetcher (Messages, Mail, Slack…), not the customer. */
export async function fromPreviewFetcher(): Promise<boolean> {
  return isLinkPreviewFetch((await headers()).get("user-agent"));
}

// ---------------------------------------------------------------------------
// The card image
// ---------------------------------------------------------------------------

type Font = { name: string; data: Buffer; weight: 400 | 500 | 600 | 700 | 800; style: "normal" };

/** The brand's faces from brand/fonts (Satori takes static TTFs, not the variable one). */
let fonts: Promise<Font[]> | null = null;
function cardFonts(): Promise<Font[]> {
  fonts ??= import("node:fs/promises").then(async ({ readFile }) => {
    const dir = `${process.cwd()}/../../brand/fonts`;
    const faces: [string, string, Font["weight"]][] = [
      ["Barlow Semi Condensed", "BarlowSemiCondensed-Bold.ttf", 700],
      ["Barlow Semi Condensed", "BarlowSemiCondensed-ExtraBold.ttf", 800],
      ["Public Sans", "PublicSans-Medium.ttf", 500],
      ["Public Sans", "PublicSans-SemiBold.ttf", 600],
    ];
    return Promise.all(
      faces.map(async ([name, file, weight]) => ({
        name,
        data: await readFile(`${dir}/${file}`),
        weight,
        style: "normal" as const,
      })),
    );
  });
  return fonts;
}

let mark: Promise<string | null> | null = null;
function sundeckMark(): Promise<string | null> {
  mark ??= import("node:fs/promises")
    .then(({ readFile }) => readFile(`${process.cwd()}/public/sundeck-mark.svg`))
    .then((svg) => `data:image/svg+xml;base64,${svg.toString("base64")}`)
    .catch(() => null);
  return mark;
}

/** Width and height of a PNG, JPEG or SVG logo; null when they can't be read. */
export function imageSize(
  bytes: Uint8Array,
  type: string,
): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === "image/png" && bytes.length > 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === "image/jpeg") {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1]!;
      const length = view.getUint16(i + 2);
      // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      i += 2 + length;
    }
    return null;
  }
  if (type === "image/svg+xml") {
    const head = new TextDecoder().decode(bytes.subarray(0, 4096));
    const tag = /<svg\b[^>]*>/i.exec(head)?.[0] ?? "";
    const num = (name: string) => {
      const m = new RegExp(`\\b${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i").exec(tag);
      return m ? Number(m[1]) : null;
    };
    const box = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
    const width = num("width") ?? (box ? Number(box[1]) : null);
    const height = num("height") ?? (box ? Number(box[2]) : null);
    return width && height ? { width, height } : null;
  }
  return null;
}

/**
 * The shop's logo, fetched from storage with the anon key (allowed while the link works).
 * `logo` is null when the card should set the shop's name instead; `settled` is false when that's
 * only because the fetch failed (so the card isn't kept long).
 */
async function loadLogo(path: string): Promise<{ logo: CardLogo | null; settled: boolean }> {
  const unusable = { logo: null, settled: true };
  const failed = { logo: null, settled: false };
  try {
    const signed = await publicClient().storage.from("company-assets").createSignedUrl(path, 60);
    if (!signed.data?.signedUrl) return failed;
    const res = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return failed;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) return unusable;
    const ext = path.split(".").pop()?.toLowerCase();
    const type =
      ext === "svg"
        ? "image/svg+xml"
        : ext === "png"
          ? "image/png"
          : ext === "jpg" || ext === "jpeg"
            ? "image/jpeg"
            : (res.headers.get("content-type") ?? "").split(";")[0]!;
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(type)) return unusable;
    // An SVG whose letters are live text draws them in whatever font the renderer has, which
    // can clip or change the shop's name: the card sets the name in large type instead.
    if (type === "image/svg+xml" && svgHasLiveText(bytes)) return unusable;
    const size = imageSize(bytes, type) ?? { width: 560, height: 150 };
    return {
      logo: {
        src: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`,
        ...fitLogo(size.width, size.height),
      },
      settled: true,
    };
  } catch {
    return failed;
  }
}

/** Whether an SVG draws letters from a font (<text>) rather than outlines. */
export function svgHasLiveText(bytes: Uint8Array): boolean {
  return /<(?:svg:)?text[\s>]/i.test(new TextDecoder().decode(bytes));
}

/** Kept a day when the URL's version matches (the URL changes with the card); else 5 minutes. */
const KEEP = "public, max-age=86400, s-maxage=86400, immutable";
const BRIEF = "public, max-age=300, s-maxage=300";

/** Renders a card. Exported for the sample sheet (scripts/link-preview-samples.tsx). */
export async function renderCard(
  preview: LinkPreview,
  logo: CardLogo | null,
  cacheControl = BRIEF,
): Promise<ImageResponse> {
  return new ImageResponse(
    <LinkPreviewArt card={preview.card} logo={logo} mark={await sundeckMark()} />,
    {
      ...CARD_SIZE,
      fonts: await cardFonts(),
      headers: { "cache-control": cacheControl, "x-robots-tag": "noindex" },
    },
  );
}

/** GET /{q|i|r}/{token}/card.png?v=… */
export async function cardImageResponse(
  kind: LinkPreviewKind,
  token: string,
  version: string | null,
): Promise<Response> {
  const row = await loadLinkPreview(token);
  if (!row || row.kind !== kind)
    return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  const preview = linkPreview(row);
  const { logo, settled } = preview.card.logoPath
    ? await loadLogo(preview.card.logoPath)
    : { logo: null, settled: true };
  const keep =
    settled && preview.card.tone === "document" && version === linkPreviewVersion(preview);
  return renderCard(preview, logo, keep ? KEEP : BRIEF);
}
