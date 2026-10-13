"use client";

import { useActionState } from "react";
import { stopFollowups } from "@/app/actions/stop";
import { Button, Notice } from "./ui";

export function StopForm({ token, shop }: { token: string; shop: string }) {
  const [state, action, pending] = useActionState(stopFollowups, {});
  if (state.message)
    return (
      <Notice tone="success">
        Done. {shop} won’t send you reminder or review emails. You’ll still get reports, receipts,
        and anything you ask for.
      </Notice>
    );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Stop These Emails"}
      </Button>
    </form>
  );
}
