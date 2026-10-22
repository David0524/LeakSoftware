"use client";

import { useActionState } from "react";
import { turnOffWeeklySummary } from "@/app/actions/weekly-summary";
import { orOffline } from "@/lib/offline";
import { Banner } from "./doc-ui";
import { Button } from "./ui";

/** Turn Off Weekly Summary, from the email's link (owner, 2026-10-22). */
export function WeeklySummaryOffForm({ token, off }: { token: string; off: boolean }) {
  const [state, action, pending] = useActionState(orOffline(turnOffWeeklySummary), {});
  if (state.message || off)
    return (
      <Banner tone="success">
        The weekly summary is off. Turn it back on any time in More › Notifications.
      </Banner>
    );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Saving…" : "Turn Off Weekly Summary"}
      </Button>
    </form>
  );
}
