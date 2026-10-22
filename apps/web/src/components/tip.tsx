"use client";

import { useState, useTransition } from "react";
import { dismissTip } from "@/app/actions/walkthrough";
import { whenOffline } from "@/lib/offline";

/**
 * A tip on the screen it explains, shown once (as iOS TipKit draws them): an icon, a short
 * title and message, and a close button. Closing it hides it at once and remembers it.
 */
export function TipCard({ id, title, message }: { id: string; title: string; message: string }) {
  const [open, setOpen] = useState(true);
  const [, start] = useTransition();
  if (!open) return null;
  return (
    <aside
      aria-label={`Tip: ${title}`}
      data-testid="tip"
      className="card mb-5 flex max-w-2xl items-start gap-3 py-3 pr-1 pl-4"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="mt-0.5 size-6 shrink-0 fill-none stroke-link stroke-2"
      >
        <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
      </svg>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold">{title}</p>
        <p className="text-[0.9375rem] text-text-muted">{message}</p>
      </div>
      <button
        type="button"
        aria-label="Close Tip"
        onClick={() => {
          setOpen(false);
          start(() => whenOffline(dismissTip(id), undefined));
        }}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-text/[0.06]"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 stroke-current stroke-2">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </aside>
  );
}
