import type { Metadata } from "next";

/**
 * The rich link preview for Sundeck Pro's own marketing pages (owner, 2026-10-23: "iMessage can
 * support animated website previews. We need to do that"). Messages downloads an `og:video`
 * that points straight at an MP4 and plays it in the preview (Apple TN3156); the image stands
 * in where video doesn't play. Both files live in public/og (cut from the hype film,
 * apps/video). Customer pages (reports, quotes, invoices) carry the shop's brand and never use
 * this.
 */
/** Next makes image URLs absolute from metadataBase but not video ones, so this one is spelled out. */
const VIDEO = "https://sundeckpro.com/og/sundeck-pro.mp4";

export function sharePreview(title: string, description: string): Metadata {
  return {
    openGraph: {
      type: "website",
      siteName: "Sundeck Pro",
      title,
      description,
      images: [{ url: "/og/sundeck-pro.jpg", width: 1200, height: 630, alt: "Sundeck Pro" }],
      videos: [{ url: VIDEO, type: "video/mp4", width: 1280, height: 720 }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og/sundeck-pro.jpg"] },
  };
}
