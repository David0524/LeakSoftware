import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// Unit tests only; Playwright runs e2e/ (pnpm test:e2e).
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Next's guard against importing server code in the browser; a no-op in tests.
      "server-only": resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: { include: ["test/**/*.test.ts"] },
});
