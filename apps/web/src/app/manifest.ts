import type { MetadataRoute } from "next";
import { tokens } from "@leakbook/tokens";

/**
 * "Add to Home Screen": the office opens full screen like an app, with no browser bars
 * (owner, 2026-10-14: "feel like Apple"). Starts on Today.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tidemark",
    short_name: "Tidemark",
    description: "Inspection reports, repair quotes, and invoicing for pool leak detection shops.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: tokens.color.role.light.bg,
    theme_color: tokens.color.role.light.bg,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
