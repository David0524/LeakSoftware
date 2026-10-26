"use client";

import { useState, useTransition } from "react";
import { removeReading, restoreReading } from "@/app/actions/chemicals";
import { restoreWith, showRemoved } from "./removed";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

/**
 * Removes a chemical log entry submitted by mistake: at once, with Undo for five seconds
 * (owner, 2026-10-26), not asked first.
 */
export function RemoveReading({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label="Remove these readings"
        className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] text-status-fail hover:bg-status-fail/10 disabled:opacity-50"
        onClick={() => {
          const form = new FormData();
          form.set("reading", id);
          start(async () => {
            const done = await whenOffline(removeReading({}, form), { error: NO_CONNECTION });
            setError(done.error ?? null);
            if (!done.error) showRemoved("readings", restoreWith(restoreReading, { reading: id }));
          });
        }}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error ? (
        <span role="alert" className="block text-[0.8125rem] text-status-fail">
          {error}
        </span>
      ) : null}
    </>
  );
}
