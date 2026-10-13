"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { deleteCustomer } from "@/app/actions/jobs";
import { Button, Notice } from "./ui";

/** Owners: delete a customer, then go back to the list. */
export function DeleteCustomerForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteCustomer, {});
  const router = useRouter();
  useEffect(() => {
    if (state.message === "deleted") {
      router.replace("/customers");
      router.refresh();
    }
  }, [state.message, router]);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="customer" value={id} />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button
        type="submit"
        kind="danger"
        disabled={pending || state.message === "deleted"}
        onClick={(e) => {
          if (!window.confirm(`Delete ${name}? This can't be undone from Tidemark.`))
            e.preventDefault();
        }}
      >
        {pending ? "Deleting…" : "Delete Customer"}
      </Button>
    </form>
  );
}
