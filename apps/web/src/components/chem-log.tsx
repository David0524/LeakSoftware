"use client";

import { useState, useTransition } from "react";
import { removeReading } from "@/app/actions/chemicals";
import { useConfirm } from "./sheet";

/** Removes a chemical log entry submitted by mistake, after a confirm. */
export function RemoveReading({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, confirmSheet] = useConfirm();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label="Remove these readings"
        className="inline-flex min-h-11 items-center rounded-full px-3 text-[0.9375rem] text-status-fail hover:bg-status-fail/10 disabled:opacity-50"
        onClick={async () => {
          if (
            !(await confirm({
              title: "Remove these readings?",
              message: "They come off the pool’s chemical log.",
              confirmLabel: "Remove Readings",
              destructive: true,
            }))
          )
            return;
          const form = new FormData();
          form.set("reading", id);
          start(async () => {
            const done = await removeReading({}, form);
            setError(done.error ?? null);
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
      {confirmSheet}
    </>
  );
}
