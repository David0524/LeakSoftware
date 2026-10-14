import * as Sentry from "@sentry/nextjs";
import { SENTRY_PRIVACY } from "@/lib/sentry";

// Browser error monitoring (M11). Off unless NEXT_PUBLIC_SENTRY_DSN is set (a DSN is public by
// design). No session replay or personal data (lib/sentry.ts).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, ...SENTRY_PRIVACY });
}

export const onRouterTransitionStart = dsn ? Sentry.captureRouterTransitionStart : undefined;
