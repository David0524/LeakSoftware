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

const nextConfig: NextConfig = {
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
