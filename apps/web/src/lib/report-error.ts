import { usageError } from "./usage-client";

// Sends a caught error to Sentry when it's set up; loads the SDK only then (M11).
// Also counted in the Admin portal's Usage as an error on this screen (owner, 2026-10-22).
export function reportError(error: unknown) {
  usageError(`Error screen: ${error instanceof Error ? error.message : String(error)}`);
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
}
