"use server";

import { JOB_TYPE_LABELS, type JobTypeFilter } from "@leakbook/core";
import { isUuid } from "@/lib/uuid";
import { getOffice } from "@/lib/auth";
import { activityPage, type ActivityPage } from "@/lib/activity";
import { createClient } from "@/lib/supabase/server";

/** The next page of Activity, after the last event shown, of the type picked (if any). */
export async function moreActivity(
  after: { at: string; id: string },
  type: JobTypeFilter = "all",
): Promise<ActivityPage> {
  const office = await getOffice();
  if (!isUuid(after.id) || Number.isNaN(Date.parse(after.at))) return { events: [], more: false };
  const only = Object.hasOwn(JOB_TYPE_LABELS, type) ? type : "all";
  return activityPage(office, after, undefined, only);
}

/** This person opened Activity: the dot goes away. */
export async function markActivitySeen(): Promise<void> {
  await getOffice();
  await (await createClient()).rpc("mark_activity_seen");
}
