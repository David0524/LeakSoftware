"use server";

import { publicClient } from "@/server/reports";
import type { FormState } from "./auth";

/** The weekly summary email's turn-off link (owner, 2026-10-22): no sign-in. */
export async function turnOffWeeklySummary(_: FormState, form: FormData): Promise<FormState> {
  const { data, error } = await publicClient().rpc("weekly_summary_off", {
    link_token: String(form.get("token") ?? ""),
  });
  if (error || !data)
    return { error: "This link no longer works. Turn it off in More › Notifications." };
  return { message: "done" };
}
