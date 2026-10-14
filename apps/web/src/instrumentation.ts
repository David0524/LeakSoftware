import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY } from "@/lib/sentry";

// Server error monitoring (M11). Off unless SENTRY_DSN is set. Customer details are not sent:
// see lib/sentry.ts.
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    ...SENTRY_PRIVACY,
  });
}

export const onRequestError = Sentry.captureRequestError;
