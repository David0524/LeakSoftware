"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addQuotePoolAction, deleteQuoteAction } from "@/app/actions/standalone-quotes";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { SField, SSelect, SettingsFields, SettingsForm } from "./settings-forms";
import { useConfirm } from "./sheet";
import { Button } from "./ui";

// The Quote screen's own controls (docs/design/2026-11-24-standalone-quotes.md): Add Pool for a
// quote job with none, and Delete Quote for a draft standalone quote.

/** Add Pool's sheet: one of the customer's pools, or a new address. */
export function AddPoolForm({
  jobId,
  quoteId,
  pools,
}: {
  jobId: string;
  quoteId: string;
  pools: { id: string; label: string }[];
}) {
  const [pool, setPool] = useState(pools[0]?.id ?? "new");
  return (
    <SettingsForm action={addQuotePoolAction} submit="Add Pool" full>
      <input type="hidden" name="job" value={jobId} />
      <input type="hidden" name="quote" value={quoteId} />
      {pools.length ? (
        <SettingsFields labelWidth="5rem">
          <SSelect
            label="Pool"
            name="property"
            value={pool}
            onChange={(e) => setPool(e.target.value)}
            options={[
              ...pools.map((p) => ({ value: p.id, label: p.label })),
              { value: "new", label: "New address…" },
            ]}
          />
        </SettingsFields>
      ) : (
        <input type="hidden" name="property" value="new" />
      )}
      {pool === "new" ? (
        <SettingsFields labelWidth="5rem">
          <SField label="Street" name="address_line1" required autoComplete="off" />
          <SField label="City" name="city" />
          <SField label="State" name="state" maxLength={2} />
          <SField label="ZIP" name="postal_code" inputMode="numeric" />
        </SettingsFields>
      ) : null}
    </SettingsForm>
  );
}

/** Delete Quote, at the bottom of a draft standalone quote: asks, deletes, and goes back. */
export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [confirm, confirmSheet] = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        kind="danger"
        disabled={pending}
        className="w-full sm:w-auto"
        onClick={async () => {
          if (
            !(await confirm({
              title: "Delete this quote?",
              confirmLabel: "Delete",
              cancelLabel: "Cancel",
              destructive: true,
            }))
          )
            return;
          start(async () => {
            const r = await whenOffline(deleteQuoteAction(quoteId), {
              ok: false as const,
              error: NO_CONNECTION,
            });
            if (!r.ok) {
              setError(r.error);
              return;
            }
            // Back where it came from, or to Quotes when it was opened on its own.
            if (window.history.length > 1) router.back();
            else router.replace("/quotes");
          });
        }}
      >
        Delete Quote
      </Button>
      {error ? (
        <p role="alert" className="text-[0.9375rem] text-status-fail">
          {error}
        </p>
      ) : null}
      {confirmSheet}
    </div>
  );
}
