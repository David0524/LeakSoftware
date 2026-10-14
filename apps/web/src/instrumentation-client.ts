// Browser error monitoring (M11). Off unless NEXT_PUBLIC_SENTRY_DSN is set (a DSN is public by
// design). Loaded only when it's on, so the SDK isn't in every page's download. No session
// replay or personal data (lib/sentry.ts).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void Promise.all([import("@sentry/nextjs"), import("@/lib/sentry")]).then(
    ([Sentry, { SENTRY_PRIVACY }]) => Sentry.init({ dsn, ...SENTRY_PRIVACY }),
  );
}
