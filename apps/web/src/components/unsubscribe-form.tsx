"use client";

import { useActionState } from "react";
import { UNSUBSCRIBE_TEXT } from "@leakbook/core";
import { unsubscribe } from "@/app/actions/unsubscribe";
import { Banner } from "./doc-ui";
import { Button } from "./ui";
import { orOffline } from "@/lib/offline";

/** The unsubscribe page's one button (a page, not on open, so link scanners can't do it). */
export function UnsubscribeForm({ token, shop }: { token: string; shop: string }) {
  const [state, action, pending] = useActionState(orOffline(unsubscribe), {});
  if (state.message) return <Banner tone="success">{UNSUBSCRIBE_TEXT.done(shop)}</Banner>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : UNSUBSCRIBE_TEXT.button}
      </Button>
    </form>
  );
}
