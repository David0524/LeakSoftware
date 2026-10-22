"use server";

import { revalidatePath } from "next/cache";
import { NOTIFICATION_KINDS, WEEKLY_SUMMARY_PREF } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

/**
 * More › Notifications: this person's kinds, on or off (owner, 2026-10-19), and the weekly
 * summary email when the page showed it (owners and admins); otherwise that choice is kept.
 */
export async function saveNotificationPrefs(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const db = await createClient();
  const { data: current } = await db
    .from("profile")
    .select("notification_prefs")
    .eq("id", office.user.id)
    .maybeSingle();
  const before = (current?.notification_prefs ?? {}) as Record<string, unknown>;
  const weekly = WEEKLY_SUMMARY_PREF.key;
  const prefs: Record<string, boolean> = Object.fromEntries(
    NOTIFICATION_KINDS.map((k) => [k.key, form.get(k.key) === "on"]),
  );
  if (form.get(`${weekly}_shown`) === "1") prefs[weekly] = form.get(weekly) === "on";
  else if (typeof before[weekly] === "boolean") prefs[weekly] = before[weekly] as boolean;
  const { error } = await db
    .from("profile")
    .update({ notification_prefs: prefs })
    .eq("id", office.user.id);
  if (error) return { error: error.message };
  revalidatePath("/more", "layout");
  return { message: "Saved." };
}
