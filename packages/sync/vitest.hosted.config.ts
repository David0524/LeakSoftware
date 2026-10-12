import { defineConfig } from "vitest/config";

// Talks to the hosted dev project (config/supabase-dev.json) as the demo tech.
// Run: NODE_USE_ENV_PROXY=1 pnpm --filter @leakbook/sync test:hosted
export default defineConfig({
  test: { include: ["test/hosted/**/*.test.ts"], testTimeout: 60_000 },
});
