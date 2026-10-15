"use client";

import { useState, useTransition } from "react";
import { deleteCustomer } from "@/app/actions/jobs";
import { useConfirm } from "./sheet";
import { Notice } from "./ui";

/**
 * Owners: delete a customer, then go back to the list. The action is called directly and the
 * list is loaded here once the delete succeeds.
 */
export function DeleteCustomerForm({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmSheet] = useConfirm();
  return (
    <div className="space-y-2">
      {error ? <Notice tone="error">{error}</Notice> : null}
      {/* iOS: a destructive action at the end of a page is one red row on its own. */}
      <button
        type="button"
        disabled={pending}
        className="card block min-h-11 w-full px-4 py-2.5 text-center text-status-fail active:bg-text/[0.06] disabled:opacity-60"
        onClick={async () => {
          const ok = await confirm({
            title: `Delete ${name}?`,
            message: "This can’t be undone from Tidemark.",
            confirmLabel: "Delete Customer",
            destructive: true,
          });
          if (!ok) return;
          setError(null);
          startTransition(async () => {
            const form = new FormData();
            form.set("customer", id);
            const r = await deleteCustomer({}, form);
            if (r.error) setError(r.error);
            // A full load on purpose: in-app navigation from this page kept showing the deleted
            // customer (CI runs 44 and 45).
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            else window.location.assign("/customers");
          });
        }}
      >
        {pending ? "Deleting…" : "Delete Customer"}
      </button>
      {confirmSheet}
    </div>
  );
}
