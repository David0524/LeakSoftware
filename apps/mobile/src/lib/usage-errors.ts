// Errors people saw, counted in the Admin portal's Usage (owner, 2026-10-22). No imports, so
// data code can report them without loading Sentry; features/usage/UsageTracker.tsx listens.

let listener: ((detail: string) => void) | null = null;

export function onReportedError(fn: (detail: string) => void) {
  listener = fn;
}

/** An error people saw (a crash screen, a send the server refused). */
export function noteError(detail: string) {
  listener?.(detail);
}
