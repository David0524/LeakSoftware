"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCustomer } from "@/app/actions/jobs";
import { Button, Notice } from "./ui";

/**
 * Owners: delete a customer, then go back to the list. The action is called directly and the
 * navigation happens here, because refreshing this page after the delete unmounts the form.
 */
export function DeleteCustomerForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        type="button"
        kind="danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Delete ${name}? This can't be undone from Tidemark.`)) return;
          setError(null);
          startTransition(async () => {
            const form = new FormData();
            form.set("customer", id);
            const r = await deleteCustomer({}, form);
            if (r.error) setError(r.error);
            else {
              router.replace("/customers");
              router.refresh();
            }
          });
        }}
      >
        {pending ? "Deleting…" : "Delete Customer"}
      </Button>
    </div>
  );
}
