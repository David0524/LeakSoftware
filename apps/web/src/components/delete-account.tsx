"use client";

import { useActionState } from "react";
import { deleteMyAccount } from "@/app/actions/account";
import { Button, Field, Notice } from "./ui";

/**
 * Delete My Account (M11; App Store rule 5.1.1(v)). Folded away and confirmed by typing,
 * since it can't be undone (apple-design: destructive actions get a warning).
 */
export function DeleteAccount() {
  const [state, action, pending] = useActionState(deleteMyAccount, {});
  return (
    <details className="mt-6 card px-4 py-1.5">
      <summary className="flex min-h-12 cursor-pointer items-center font-medium text-status-fail">
        Delete My Account
      </summary>
      <form action={action} className="space-y-3 pb-4">
        <p className="text-[0.9375rem] text-text-muted">
          Removes your sign-in. The jobs, reports, and invoices you worked on stay with the shop. If
          you’re the shop’s only owner, we’ll delete the shop’s data too, within 30 days.
        </p>
        <Field label="Type DELETE to confirm" name="confirm" autoComplete="off" />
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state.message ? <Notice tone="success">{state.message}</Notice> : null}
        <Button type="submit" kind="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete My Account"}
        </Button>
      </form>
    </details>
  );
}
