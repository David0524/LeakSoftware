import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoSkipNotification, skipNotification } from "@leakbook/core";
import { notify, shopManagers } from "./push";

// Skip a Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md): the server's two
// jobs. The day-end skip of visits nobody started (shops that turned on Skip Unfinished Visits
// at Day's End), and telling the owners and admins about each skip once.

interface SkipRow {
  job_id: string;
  company_id: string;
  customer: string | null;
  skip_reason: string | null;
  skipped_by: string | null;
}

/**
 * Hand out the skips the owners and admins haven't heard about (the database marks each as it
 * goes, so none is told twice) and push them: one notification per visit a person skipped,
 * to the shop's owners and admins except whoever skipped it; one digest per shop for the
 * visits the day-end skip made. `onlyJob` is the phone telling us a skip it just made.
 * Never throws: a notification that doesn't go out never fails the skip.
 */
export async function notifySkips(
  db: SupabaseClient,
  onlyJob?: string | null,
): Promise<{ notified: number; visits: number }> {
  try {
    const { data, error } = await db.rpc("skips_to_notify", { only_job: onlyJob ?? null });
    if (error || !Array.isArray(data) || data.length === 0) return { notified: 0, visits: 0 };
    const rows = data as SkipRow[];
    const skippers = [...new Set(rows.map((r) => r.skipped_by).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (skippers.length) {
      const { data: people } = await db.from("profile").select("id, full_name").in("id", skippers);
      for (const p of (people ?? []) as { id: string; full_name: string | null }[]) {
        const first = p.full_name?.trim().split(/\s+/)[0];
        if (first) names.set(p.id, first);
      }
    }
    let notified = 0;
    const byShop = new Map<string, number>();
    for (const r of rows) {
      if (!r.skipped_by) {
        byShop.set(r.company_id, (byShop.get(r.company_id) ?? 0) + 1);
        continue;
      }
      const managers = (await shopManagers(db, r.company_id)).filter((id) => id !== r.skipped_by);
      const { sent } = await notify(db, {
        userIds: managers,
        kind: "skip",
        text: skipNotification({
          customer: r.customer?.trim() || "A customer",
          reason: r.skip_reason?.trim() || "No reason given",
          by: names.get(r.skipped_by) ?? null,
        }),
        data: { job: r.job_id },
      });
      notified += sent;
    }
    for (const [companyId, count] of byShop) {
      const { sent } = await notify(db, {
        userIds: await shopManagers(db, companyId),
        kind: "skip",
        text: autoSkipNotification(count),
      });
      notified += sent;
    }
    return { notified, visits: rows.length };
  } catch {
    return { notified: 0, visits: 0 };
  }
}

/**
 * The daily run (service role): Skip Unfinished Visits at Day's End for the shops that turned
 * it on (not-started visits of the last three days become skipped as Not Done), then the
 * catch-up push for every skip not yet told. Errors are returned, not thrown.
 */
export async function runSkipVisits(
  db: SupabaseClient,
  at: Date = new Date(),
): Promise<{ skipped: number; notified: number } | { error: string }> {
  const { data, error } = await db.rpc("auto_skip_visits", { at: at.toISOString() });
  if (error) return { error: error.message };
  const told = await notifySkips(db);
  return { skipped: Array.isArray(data) ? data.length : 0, notified: told.notified };
}
