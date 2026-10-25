import type { Metadata } from "next";
import splash from "@/app/splash.json";

/** Every page's metadata, from the root layout. A page's own metadata merges over it. */
export const rootMetadata: Metadata = {
  // Link previews need absolute URLs (lib/share-preview).
  metadataBase: new URL("https://sundeckpro.com"),
  title: "Sundeck Pro",
  description:
    "Routes, checklists, quotes, and invoicing for pool service and leak detection shops.",
  // Added to an iPhone's Home Screen, the site opens full screen like an app. Its launch images
  // are STARTUP_IMAGES, set in the layout's <head>, not here.
  appleWebApp: { capable: true, title: "Sundeck Pro", statusBarStyle: "default" },
};

/**
 * The Home Screen launch images (page color and the mark, light and dark, per screen size), so
 * the site doesn't flash white as it opens; regenerate them with
 * `node brand/scripts/build_splash.mjs`.
 *
 * The root layout writes these 38 links into <head> itself instead of through `appleWebApp`
 * (2026-10-25). In metadata they came before every page's og and twitter tags and made the
 * metadata over 3,200 bytes, past which React streams the rest in separate pieces. On a
 * customer's /q, /i or /r link those pieces could miss <head>, and Messages, Mail and Slack
 * found no preview (test/link-preview.test.ts keeps every og tag in the first piece).
 */
export const STARTUP_IMAGES: { url: string; media: string }[] = splash;
