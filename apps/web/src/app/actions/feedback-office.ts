"use server";

import { revalidatePath } from "next/cache";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/limits";
import type { FormState } from "./auth";

/** Close or reopen a complaint with the office's note (owners and admins). */
export async function setFeedbackStatus(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  if (!office.isManager) return { error: "Only owners and admins can work customer feedback." };
  const status = form.get("status") === "open" ? "open" : "closed";
  const note = String(form.get("note") ?? "");
  if (note.length > 2000) return { error: "Keep the note under 2,000 characters." };
  const { error } = await (
    await createClient()
  ).rpc("set_feedback_status", {
    target_feedback: String(form.get("id") ?? ""),
    new_status: status,
    new_note: note,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/feedback");
  revalidatePath("/dashboard");
  return { message: status === "closed" ? "Closed." : "Reopened." };
}
