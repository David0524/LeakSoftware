import "server-only";
import { cache } from "react";
import { ACTIVITY_PAGE_SIZE, type ActivityEvent } from "@leakbook/core";
import type { Office } from "./auth";
import { createClient } from "./supabase/server";

// Activity (owner, 2026-10-20; docs/plans/search-and-activity.md section 2), read as the
// signed-in person: row security decides which events they see.

export interface ActivityPage {
  events: ActivityEvent[];
  more: boolean;
}

/** A page of the shop's activity, newest first; pass the last event to get the next page. */
export async function activityPage(
  office: Office,
  after?: { at: string; id: string } | null,
  size = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const { data, error } = await (
    await createClient()
  ).rpc("activity_feed", {
    target_company: office.company.id,
    before_at: after?.at ?? null,
    before_id: after?.id ?? null,
    page_size: size,
  });
  if (error) throw new Error(error.message);
  const page = (data ?? {}) as { events?: ActivityEvent[]; more?: boolean };
  return { events: page.events ?? [], more: Boolean(page.more) };
}

/** Events since this person last opened Activity (the dot on More and the Activity row). */
export const activityUnread = cache(async (office: Office): Promise<boolean> => {
  const { data, error } = await (
    await createClient()
  ).rpc("activity_unread", { target_company: office.company.id });
  // A database without Activity yet shows no dot.
  return !error && data === true;
});
