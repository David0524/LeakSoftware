"use server";

import { publicClient } from "@/server/reports";
import type { FormState } from "./auth";

/** The customer stops reminder and review emails (M10), from the link in any of them. */
export async function stopFollowups(_: FormState, form: FormData): Promise<FormState> {
  const { data, error } = await publicClient().rpc("opt_out_for_token", {
    link_token: String(form.get("token") ?? ""),
  });
  if (error || !data) return { error: "This link no longer works. Reply to the email instead." };
  return { message: "done" };
}
