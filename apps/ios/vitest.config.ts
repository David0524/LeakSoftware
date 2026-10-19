import { defineConfig } from "vitest/config";

// Only the fixture generator; .build/ holds Swift package checkouts with their own tests.
export default defineConfig({ test: { include: ["fixtures/**/*.test.ts"] } });
