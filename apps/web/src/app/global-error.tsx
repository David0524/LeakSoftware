"use client";

import { reportError } from "@/lib/report-error";
import { useEffect } from "react";
import { tokens } from "@leakbook/tokens";

const light = tokens.color.role.light;
const dark = tokens.color.role.dark;

/**
 * When even the page frame fails (M11). It renders its own document without the site's
 * styles, so it carries a little CSS of its own and follows the phone's appearance.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);
  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Sundeck Pro</title>
        <style>{`
          body { margin: 0; font: 17px/1.5 system-ui, sans-serif; background: ${light.bg}; color: ${light.text}; }
          @media (prefers-color-scheme: dark) { body { background: ${dark.bg}; color: ${dark.text}; } }
          main { max-width: 32rem; margin: 0 auto; padding: 4rem 1rem; text-align: center; }
          button { min-height: 44px; padding: 0 1.25rem; border: 0; border-radius: 999px; font: 700 17px system-ui, sans-serif; background: ${light.primary}; color: ${light.onPrimary}; cursor: pointer; }
          a { color: inherit; }
        `}</style>
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>Sundeck Pro didn’t load. Try again in a moment.</p>
          <p>
            <button type="button" onClick={() => retry()}>
              Try Again
            </button>
          </p>
          {error.digest ? <p>Error code {error.digest}</p> : null}
        </main>
      </body>
    </html>
  );
}
