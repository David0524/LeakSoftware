import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import type { NextConfig } from "next";

// File tracing misses files these packages load at run time (playwright-core's
// browsers.json, the serverless Chromium in @sparticuz/chromium/bin). Without them the
// PDF routes fail on Vercel. Paths are relative to this folder; pnpm puts them in the
// workspace root's node_modules.
const require = createRequire(import.meta.url);
const packageDir = (entry: string, up: number) =>
  relative(import.meta.dirname, join(dirname(require.resolve(entry)), ...Array(up).fill("..")));
const pdfFiles = [
  `${packageDir("playwright-core/package.json", 0)}/**/*`,
  `${packageDir("@sparticuz/chromium", 1)}/bin/**/*`,
];

// Link-preview cards (server/link-preview.tsx) are set in the brand's faces with the mark.
const cardFiles = [
  "../../brand/fonts/BarlowSemiCondensed-Bold.ttf",
  "../../brand/fonts/BarlowSemiCondensed-ExtraBold.ttf",
  "../../brand/fonts/PublicSans-Medium.ttf",
  "../../brand/fonts/PublicSans-SemiBold.ttf",
  "./public/sundeck-mark.svg",
];

// Sent on every page. No other site may frame ours (the customer pages have Pay and Approve
// buttons, the office has a signed-in session), browsers keep the declared file types, and
// the address of a customer link (its token is the key) never goes to another site.
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  transpilePackages: ["@leakbook/core", "@leakbook/tokens"],
  // Headless Chromium for report PDFs stays a plain Node dependency.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // Every route that can render a report PDF (sending from the office job page included).
  outputFileTracingIncludes: {
    "/r/\\[token\\]/pdf": pdfFiles,
    "/i/\\[token\\]/pdf": pdfFiles,
    "/api/reports/\\[id\\]/send": pdfFiles,
    "/jobs/\\[id\\]": pdfFiles,
    // Map pin images number their stops in the brand's display face.
    "/api/map/pin/\\[pin\\]": ["../../brand/fonts/BarlowSemiCondensed-Bold.ttf"],
    "/q/\\[token\\]/card.png": cardFiles,
    "/i/\\[token\\]/card.png": cardFiles,
    "/r/\\[token\\]/card.png": cardFiles,
  },
  // Vercel runs glibc Linux, so sharp's musl build (about 19 MB) never loads there; pnpm installs
  // both. Every deployment keeps every function, and storage is billed per GB-month (owner,
  // 2026-11-13: Function Storage was half the Vercel bill).
  outputFileTracingExcludes: {
    "*": [
      "../../node_modules/.pnpm/@img+sharp-libvips-linuxmusl*/**",
      "../../node_modules/.pnpm/@img+sharp-linuxmusl*/**",
    ],
  },
  // CI type-checks every commit before it can merge (Lint, typecheck, test, build), so Vercel's
  // build skips the same check; build minutes are billed (owner, 2026-11-13).
  typescript: { ignoreBuildErrors: process.env.VERCEL === "1" },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Keep screens visited in the last minute, so going back to a tab is instant (owner,
    // 2026-10-16: the wait between screens). Saving anything refreshes them at once.
    staleTimes: { dynamic: 60 },
    // Import Customers sends up to 2,000 rows to the server at once (owner, 2026-10-16).
    serverActions: { bodySizeLimit: "5mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
