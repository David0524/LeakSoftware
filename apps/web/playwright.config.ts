import { defineConfig, devices } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_TWILIO_TOKEN, E2E_WEBHOOK_SECRET } from "./e2e/backend";
import { OUTBOX } from "./e2e/outbox";

/**
 * End-to-end tests for the office web app (M6 "Done when").
 *
 * Backend: whatever SUPABASE_URL / SUPABASE_ANON_KEY point at; with neither set, the
 * hosted dev project (config/supabase-dev.json). CI runs them against Supabase in Docker.
 *   E2E_BASE_URL       use an already running app instead of starting one
 *   PW_CHROMIUM_PATH   a preinstalled Chromium (cloud sessions: /opt/pw-browsers/chromium)
 * The started app writes emails to e2e/.outbox (EMAIL_OUTBOX_DIR) and prints PDFs with the
 * same Chromium.
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
    // Fail a step that can't find its element in 30 s, not at the end of the whole test.
    actionTimeout: 30_000,
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
        env: {
          NEXT_TELEMETRY_DISABLED: "1",
          EMAIL_OUTBOX_DIR: OUTBOX,
          // Never send real email or call the AI from tests.
          RESEND_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          // Webhooks are signed by the tests themselves; no Stripe account is called.
          STRIPE_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
          CRON_SECRET: E2E_CRON_SECRET,
          STRIPE_CONNECT_WEBHOOK_SECRET: "",
          STRIPE_SECRET_KEY: "",
          // Twilio's webhooks are signed by the tests; with no account, texts aren't sent.
          TWILIO_ACCOUNT_SID: "",
          TWILIO_AUTH_TOKEN: E2E_TWILIO_TOKEN,
          TWILIO_MESSAGING_SERVICE_SID: "",
          ...(process.env.PW_CHROMIUM_PATH ? { CHROMIUM_PATH: process.env.PW_CHROMIUM_PATH } : {}),
        },
      },
});
