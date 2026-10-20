"use server";

import { isUuid } from "@/lib/uuid";
import { getOffice } from "@/lib/auth";
import { activityPage, type ActivityPage } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";

/** The next page of Activity, after the last event shown. */
export async function moreActivity(after: { at: string; id: string }): Promise<ActivityPage> {
  const office = await getOffice();
  if (!isUuid(after.id) || Number.isNaN(Date.parse(after.at))) return { events: [], more: false };
  return activityPage(office, after);
}

/** This person opened Activity: the dot goes away. */
export async function markActivitySeen(): Promise<void> {
  await getOffice();
  await (await createClient()).rpc("mark_activity_seen");
}
