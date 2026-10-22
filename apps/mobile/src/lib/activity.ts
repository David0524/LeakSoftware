import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEvent,
  type ActivityRow,
  type JobTypeFilter,
} from "@leakbook/core";

// Activity (owner, 2026-10-20; docs/plans/search-and-activity.md section 2): read from the
// server as the signed-in person, like the Dashboard (not synced to phones), so row security
// decides which events they see. The words come from packages/core (activityRow,
// groupActivity). No React here, so it can be tested.

export interface ActivityPage {
  events: ActivityEvent[];
  more: boolean;
}

type Rpc = Pick<SupabaseClient, "rpc">;

/**
 * A page of the shop's activity, newest first; pass the last event shown for the next page. A
 * job type (the Type menu, owner 2026-10-22) keeps the events about jobs of that type.
 */
export async function fetchActivity(
  supabase: Rpc,
  companyId: string,
  after?: { created_at: string; id: string } | null,
  size = ACTIVITY_PAGE_SIZE,
  type: JobTypeFilter = "all",
): Promise<ActivityPage> {
  const { data, error } = await supabase.rpc("activity_feed", {
    target_company: companyId,
    before_at: after?.created_at ?? null,
    before_id: after?.id ?? null,
    page_size: size,
    // Left out for All Types, so a database without the filter yet still answers.
    ...(type !== "all" ? { job_type: type } : {}),
  });
  if (error) throw new Error(error.message);
  const page = (data ?? {}) as { events?: ActivityEvent[]; more?: boolean };
  return { events: page.events ?? [], more: Boolean(page.more) };
}

/** Events since this person last opened Activity (the dot on More and the Activity row). */
export async function fetchActivityUnread(supabase: Rpc, companyId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("activity_unread", { target_company: companyId });
  // A database without Activity yet shows no dot.
  return !error && data === true;
}

/** This person opened Activity: the dot goes away. */
export async function markActivitySeen(supabase: Rpc): Promise<void> {
  const { error } = await supabase.rpc("mark_activity_seen");
  if (error) throw new Error(error.message);
}

/** The next page added after what's shown, without showing an event twice. */
export function appendActivity(shown: ActivityEvent[], page: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set(shown.map((e) => e.id));
  return [...shown, ...page.filter((e) => !seen.has(e.id))];
}

/** The app route an event opens: its job, or the conversation for a text. */
export function activityPath(open: ActivityRow["open"]): string | null {
  if (!open) return null;
  return open.screen === "job" ? `/jobs/${open.id}` : `/messages/${open.id}`;
}
