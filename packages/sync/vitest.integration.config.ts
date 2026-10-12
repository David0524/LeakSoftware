import { defineConfig } from "vitest/config";

// Needs a database with the migrations applied. Run through `pnpm test:db`, which sets
// SYNC_TEST_DATABASE_URL.
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
