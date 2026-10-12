import { defineConfig } from "vitest/config";

// Unit tests only; Playwright runs e2e/ (pnpm test:e2e).
export default defineConfig({ test: { include: ["test/**/*.test.ts"] } });
