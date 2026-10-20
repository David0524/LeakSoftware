"use client";

import { useActionState } from "react";
import { stopFollowups } from "@/app/actions/stop";
import { Banner } from "./doc-ui";
import { Button } from "./ui";
import { orOffline } from "@/lib/offline";

export function StopForm({ token, shop }: { token: string; shop: string }) {
  const [state, action, pending] = useActionState(orOffline(stopFollowups), {});
  if (state.message)
    return (
      <Banner tone="success">
        Done. {shop} won’t send you reminder or review emails. You’ll still get reports, receipts,
        and anything you ask for.
      </Banner>
    );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Stop These Emails"}
      </Button>
    </form>
  );
}
