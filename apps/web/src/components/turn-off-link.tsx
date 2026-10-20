"use client";

import { useState, useTransition } from "react";
import { turnOffLink } from "@/app/actions/links";
import { useConfirm } from "./sheet";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

/** Turn Off for one customer link, after an iOS-style confirmation. */
export function TurnOffLink({ id, jobId, what }: { id: string; jobId: string; what: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  return (
    <>
      <span className="flex shrink-0 flex-col items-end">
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Turn off this ${what.toLowerCase()} link?`,
              message: "The customer won’t be able to open it. Sending it again makes a new link.",
              confirmLabel: "Turn Off Link",
              destructive: true,
            });
            if (!ok) return;
            start(async () => {
              const r = await whenOffline(turnOffLink(id, jobId), { error: NO_CONNECTION });
              setError(r.error ?? null);
            });
          }}
          className="min-h-11 rounded-full px-3 text-status-fail hover:bg-status-fail/10 disabled:opacity-60"
        >
          {pending ? "Turning Off…" : "Turn Off"}
        </button>
        {error ? (
          <span role="alert" className="text-[0.8125rem] text-status-fail">
            {error}
          </span>
        ) : null}
      </span>
      {confirmSheet}
    </>
  );
}
