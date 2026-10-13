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

const nextConfig: NextConfig = {
  transpilePackages: ["@leakbook/core", "@leakbook/tokens"],
  // Headless Chromium for report PDFs stays a plain Node dependency.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // Every route that can render a report PDF (sending from the office job page included).
  outputFileTracingIncludes: {
    "/r/\\[token\\]/pdf": pdfFiles,
    "/api/reports/\\[id\\]/send": pdfFiles,
    "/jobs/\\[id\\]": pdfFiles,
  },
  cacheComponents: true,
  partialPrefetching: true,
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
