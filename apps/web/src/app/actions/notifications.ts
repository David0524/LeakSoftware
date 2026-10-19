"use server";

import { revalidatePath } from "next/cache";
import { NOTIFICATION_KINDS } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

/** More › Notifications: this person's kinds, on or off (owner, 2026-10-19). */
export async function saveNotificationPrefs(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const prefs = Object.fromEntries(
    NOTIFICATION_KINDS.map((k) => [k.key, form.get(k.key) === "on"]),
  );
  const { error } = await (
    await createClient()
  )
    .from("profile")
    .update({ notification_prefs: prefs })
    .eq("id", office.user.id);
  if (error) return { error: error.message };
  revalidatePath("/more", "layout");
  return { message: "Saved." };
}
