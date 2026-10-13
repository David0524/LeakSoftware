import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@leakbook/core", "@leakbook/tokens"],
  // Headless Chromium for report PDFs stays a plain Node dependency.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
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
