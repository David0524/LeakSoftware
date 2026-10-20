"use client";

import { useState, useTransition } from "react";
import { removeSignature } from "@/app/actions/media";
import { useConfirm } from "./sheet";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

/**
 * Remove a signature, after a confirm (apple-design: destructive actions get a warning).
 * Reports already finished keep it; later versions don't show it.
 */
export function RemoveSignature({ id, jobId, name }: { id: string; jobId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Remove signature of ${name}`}
        className="-ml-3 inline-flex min-h-11 items-center rounded-full px-3 text-[1.0625rem] text-status-fail hover:bg-status-fail/10 disabled:opacity-50"
        onClick={async () => {
          if (
            !(await confirm({
              title: `Remove ${name}’s signature?`,
              message: "Reports already finished keep it; new versions won’t show it.",
              confirmLabel: "Remove Signature",
              destructive: true,
            }))
          )
            return;
          start(async () => {
            const done = await whenOffline(removeSignature({ id, jobId }), {
              ok: false as const,
              error: NO_CONNECTION,
            });
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
      {confirmSheet}
    </>
  );
}
