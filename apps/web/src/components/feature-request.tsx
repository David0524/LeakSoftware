"use client";

import { usePathname } from "next/navigation";
import { useActionState, useState } from "react";
import { requestFeature } from "@/app/actions/feature-requests";
import { Sheet } from "./sheet";
import { Button, cx, Notice } from "./ui";

/**
 * Request a Feature (owner, 2026-10-19): a button that opens a sheet with one box. It goes to
 * Sundeck Pro (office@sundeckpro.com and the staff list), with the page it came from.
 */
export function FeatureRequest({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // A new state each time the sheet opens, so a sent request doesn't stay "sent".
  const [round, setRound] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setRound((n) => n + 1);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className={cx(
          "flex min-h-11 w-full items-center px-4 py-2.5 text-left text-link hover:bg-text/[0.03] active:bg-text/[0.06]",
          className,
        )}
      >
        Request a Feature
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Request a Feature">
        <RequestForm key={round} onDone={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function RequestForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(requestFeature, {});
  const page = usePathname();
  if (state.message)
    return (
      <div className="space-y-4">
        <Notice tone="success">{state.message}</Notice>
        <Button type="button" onClick={onDone} className="w-full">
          Done
        </Button>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="page" value={page} />
      <label htmlFor="feature-request" className="block">
        What would make Sundeck Pro better for your shop?
      </label>
      <textarea
        id="feature-request"
        name="request"
        rows={6}
        maxLength={4000}
        required
        aria-invalid={state.fields?.request ? true : undefined}
        aria-describedby={state.fields?.request ? "feature-request-error" : undefined}
        className="block w-full rounded-[10px] border border-control-border bg-surface px-3 py-2 text-text placeholder:text-placeholder focus:outline-3 focus:outline-offset-1 focus:outline-focus"
        placeholder="Describe the feature and how you’d use it."
      />
      {state.fields?.request ? (
        <p id="feature-request-error" className="text-[0.9375rem] text-status-fail">
          {state.fields.request}
        </p>
      ) : null}
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send Request"}
      </Button>
    </form>
  );
}
