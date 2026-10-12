import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the office web app (M6 "Done when").
 *
 * Backend: whatever SUPABASE_URL / SUPABASE_ANON_KEY point at; with neither set, the
 * hosted dev project (config/supabase-dev.json). CI runs them against Supabase in Docker.
 *   E2E_BASE_URL       use an already running app instead of starting one
 *   PW_CHROMIUM_PATH   a preinstalled Chromium (cloud sessions: /opt/pw-browsers/chromium)
 */
const port = 3200;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  // The steps share accounts and data, so they run in order.
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm exec next start -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NEXT_TELEMETRY_DISABLED: "1" },
      },
});
