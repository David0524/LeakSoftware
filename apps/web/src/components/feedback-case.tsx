"use client";

import { useActionState } from "react";
import { FEEDBACK_WORDS } from "@leakbook/core";
import { setFeedbackStatus } from "@/app/actions/feedback-office";
import { orOffline } from "@/lib/offline";
import { Banner } from "./doc-ui";
import { Button, TextArea } from "./ui";

/** Close or reopen a complaint, with a note (the office's own; the customer never sees it). */
export function FeedbackCaseForm({
  id,
  open,
  note,
}: {
  id: string;
  open: boolean;
  note: string | null;
}) {
  const [state, action, pending] = useActionState(orOffline(setFeedbackStatus), {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={open ? "closed" : "open"} />
      <TextArea
        label={FEEDBACK_WORDS.noteLabel}
        name="note"
        rows={4}
        maxLength={2000}
        defaultValue={note ?? ""}
        placeholder={FEEDBACK_WORDS.notePlaceholder}
      />
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.message ? <Banner tone="success">{state.message}</Banner> : null}
      <Button type="submit" kind={open ? "primary" : "secondary"} disabled={pending}>
        {pending ? "Saving…" : open ? FEEDBACK_WORDS.close : FEEDBACK_WORDS.reopen}
      </Button>
    </form>
  );
}
