"use server";

import { UNSUBSCRIBE_TEXT } from "@leakbook/core";
import { publicClient } from "@/server/reports";
import type { FormState } from "./auth";

/** A customer unsubscribes from a shop's mass emails (and reminders), from the email's link. */
export async function unsubscribe(_: FormState, form: FormData): Promise<FormState> {
  const { data, error } = await publicClient().rpc("unsubscribe_email", {
    link_token: String(form.get("token") ?? ""),
  });
  if (error || !data) return { error: UNSUBSCRIBE_TEXT.broken };
  return { message: "done" };
}
