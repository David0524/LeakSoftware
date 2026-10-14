"use client";

import { useState, useTransition } from "react";
import { removeSignature } from "@/app/actions/media";

/**
 * Remove a signature, after a confirm (apple-design: destructive actions get a warning).
 * Reports already finished keep it; later versions don't show it.
 */
export function RemoveSignature({ id, jobId, name }: { id: string; jobId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Remove signature of ${name}`}
        className="-ml-3 inline-flex min-h-11 items-center rounded-full px-3 font-display text-[0.9375rem] font-bold text-status-fail hover:bg-status-fail/10 disabled:opacity-50"
        onClick={() => {
          if (
            !window.confirm(
              `Remove ${name}’s signature? Reports already finished keep it; new versions won’t show it.`,
            )
          )
            return;
          start(async () => {
            const done = await removeSignature({ id, jobId });
            setError(done.ok ? null : done.error);
          });
        }}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error ? (
        <p role="alert" className="text-[0.9375rem] text-status-fail">
          {error}
        </p>
      ) : null}
    </>
  );
}
