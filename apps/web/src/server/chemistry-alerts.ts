import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  formatAddress,
  outOfRangeNotification,
  outOfRangeReadings,
  type ChemicalReading,
  type OutOfRangeReading,
} from "@leakbook/core";
import { notify, shopManagers } from "./push";

// Out-of-range reading alerts (docs/design/2026-11-16-chemistry-trends.md): owners and admins
// hear when a pool's saved reading is well outside its range, once per reading of a log entry.
// Run hourly (/api/cron/chemistry). Entries are only looked at once they've sat for a while, so a
// reading typed on a visit (saved as it goes) is judged by what it ended up as.

/** How long an entry must sit unchanged before it is judged. */
export const SETTLE_MINUTES = 20;
/** How far back the run looks (hours of downtime or an offline phone's late sync still count). */
export const LOOK_BACK_DAYS = 3;

export interface ChemistryAlertRun {
  entries: number;
  alerts: number;
  sent: number;
}

/**
 * The out-of-range readings of an entry not alerted yet, recorded as alerted first (so two runs
 * never both send), then returned for the push.
 */
async function claim(
  db: SupabaseClient,
  readingId: string,
  found: OutOfRangeReading[],
): Promise<OutOfRangeReading[]> {
  const { data: done } = await db
    .from("chemical_alert")
    .select("reading_key")
    .eq("reading_id", readingId);
  const sent = new Set((done ?? []).map((r) => r.reading_key as string));
  const fresh = found.filter((o) => !sent.has(o.key));
  if (fresh.length === 0) return [];
  const { data: claimed } = await db
    .from("chemical_alert")
    .upsert(
      fresh.map((o) => ({ reading_id: readingId, reading_key: o.key })),
      { onConflict: "reading_id,reading_key", ignoreDuplicates: true },
    )
    .select("reading_key");
  const mine = new Set((claimed ?? []).map((r) => r.reading_key as string));
  return fresh.filter((o) => mine.has(o.key));
}

export async function runChemistryAlerts(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<ChemistryAlertRun> {
  const run: ChemistryAlertRun = { entries: 0, alerts: 0, sent: 0 };
  const from = new Date(now.getTime() - LOOK_BACK_DAYS * 86_400_000).toISOString();
  const to = new Date(now.getTime() - SETTLE_MINUTES * 60_000).toISOString();
  const { data, error } = await db
    .from("chemical_reading")
    .select("id, company_id, property_id, job_id, recorded_at, fc, ph, ta, ch, cya, salt, goals")
    .is("deleted_at", null)
    .gte("updated_at", from)
    .lte("updated_at", to)
    .order("updated_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as (ChemicalReading & { company_id: string })[]).map((r) => ({
    ...r,
    found: outOfRangeReadings(r),
  }));
  const flagged = rows.filter((r) => r.found.length > 0);
  run.entries = flagged.length;
  if (flagged.length === 0) return run;
  const { data: pools } = await db
    .from("property")
    .select("*, customer:customer!property_customer_id_company_id_fkey(name)")
    .in("id", [...new Set(flagged.map((r) => r.property_id))]);
  const pool = new Map(
    ((pools ?? []) as { id: string; customer: { name: string | null } | null }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  const managers = new Map<string, string[]>();
  for (const r of flagged) {
    const fresh = await claim(db, r.id, r.found);
    if (fresh.length === 0) continue;
    run.alerts += fresh.length;
    if (!managers.has(r.company_id))
      managers.set(r.company_id, await shopManagers(db, r.company_id));
    const p = pool.get(r.property_id);
    const name = p?.customer?.name?.trim() || (p ? formatAddress(p as never) : "") || "A customer";
    const { sent } = await notify(db, {
      userIds: managers.get(r.company_id) ?? [],
      kind: "chemistry",
      text: outOfRangeNotification(name, fresh),
      data: r.job_id ? { job: r.job_id } : { property: r.property_id },
    });
    run.sent += sent;
  }
  return run;
}
