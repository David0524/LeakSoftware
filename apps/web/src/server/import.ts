import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildImport,
  companyServices,
  customerKeys,
  firstVisitOn,
  formatAddress,
  formatPhone,
  IMPORT_FIELDS,
  localDate,
  type ImportField,
  type ImportProblem,
  type ImportRecord,
  type Services,
} from "@leakbook/core";
import { geocodeAddress, routingConfigured } from "./routing";

// Importing a shop's customers (owner, 2026-10-16). The file is read in the browser; the
// server checks it again here (never trusting what the page sent), finds customers already
// in Sundeck Pro, and hands the rest to public.import_customers in one transaction.

export interface ImportTarget {
  db: SupabaseClient;
  companyId: string;
}

export interface ImportSummary {
  customers: number;
  pools: number;
  plans: number;
  /** Already in Sundeck Pro (or twice in the file): left out. */
  existing: { row: number; name: string }[];
  problems: ImportProblem[];
  warnings: ImportProblem[];
  sample: { row: number; name: string; contact: string; address: string; plan: string }[];
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EVERY = ["", "Weekly", "Every 2 weeks", "Monthly", "Monthly"];

export function cleanMapping(raw: unknown, width: number): ImportField[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: width }, (_, i) =>
    typeof list[i] === "string" && list[i] in IMPORT_FIELDS ? (list[i] as ImportField) : "skip",
  );
}

export function cleanRows(raw: unknown): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 2001)
    .map((r) =>
      Array.isArray(r) ? r.slice(0, 60).map((c) => String(c ?? "").slice(0, 2000)) : [],
    );
}

async function context(t: ImportTarget) {
  const [{ data: company }, { data: members }] = await Promise.all([
    t.db.from("company").select("settings, timezone").eq("id", t.companyId).single(),
    t.db
      .from("membership")
      .select("user_id, status, profile:profile!membership_user_profile_fkey(full_name, email)")
      .eq("company_id", t.companyId)
      .is("deleted_at", null),
  ]);
  const services: Services = companyServices(company?.settings);
  const team = (
    (members ?? []) as unknown as {
      user_id: string;
      status: string;
      profile: { full_name: string | null; email: string | null } | null;
    }[]
  )
    .filter((m) => m.status === "active")
    .map((m) => ({
      id: m.user_id,
      name: m.profile?.full_name ?? null,
      email: m.profile?.email ?? null,
    }));
  return { services, team, timezone: (company?.timezone as string) ?? "America/New_York" };
}

/** Keys of the shop's customers already in Sundeck Pro (email, phone, name and address). */
async function existingKeys(t: ImportTarget): Promise<Set<string>> {
  const { data } = await t.db
    .from("customer")
    .select("name, email, phone, property(address_line1)")
    .eq("company_id", t.companyId)
    .is("deleted_at", null)
    .limit(20000);
  const keys = new Set<string>();
  for (const c of (data ?? []) as {
    name: string;
    email: string | null;
    phone: string | null;
    property: { address_line1: string }[] | null;
  }[]) {
    for (const k of customerKeys({ ...c, address: null })) keys.add(k);
    for (const p of c.property ?? [])
      for (const k of customerKeys({ ...c, email: null, phone: null, address: p.address_line1 }))
        keys.add(k);
  }
  return keys;
}

async function prepare(t: ImportTarget, rows: string[][], mapping: ImportField[]) {
  const ctx = await context(t);
  const { records, problems } = buildImport(rows, mapping, ctx);
  const seen = await existingKeys(t);
  const fresh: ImportRecord[] = [];
  const existing: ImportSummary["existing"] = [];
  for (const r of records) {
    const keys = customerKeys({
      name: r.customer.name,
      email: r.customer.email,
      phone: r.customer.phone,
      address: r.property?.address_line1 ?? null,
    });
    if (keys.some((k) => seen.has(k))) existing.push({ row: r.row, name: r.customer.name });
    else {
      fresh.push(r);
      for (const k of keys) seen.add(k);
    }
  }
  return { ctx, fresh, existing, problems };
}

export async function checkImportFor(
  t: ImportTarget,
  rows: string[][],
  mapping: ImportField[],
): Promise<ImportSummary> {
  const { ctx, fresh, existing, problems } = await prepare(t, rows, mapping);
  const names = new Map(ctx.team.map((m) => [m.id, m.name ?? m.email ?? "Tech"]));
  return {
    customers: fresh.length,
    pools: fresh.filter((r) => r.property).length,
    plans: fresh.filter((r) => r.plan).length,
    existing,
    problems,
    warnings: fresh.flatMap((r) => r.warnings.map((message) => ({ row: r.row, message }))),
    sample: fresh.slice(0, 12).map((r) => ({
      row: r.row,
      name: r.customer.name,
      contact: [r.customer.phone && formatPhone(r.customer.phone), r.customer.email]
        .filter(Boolean)
        .join(" · "),
      address: r.property ? formatAddress(r.property) : "",
      plan: r.plan
        ? [
            DAY_NAMES[r.plan.weekday],
            EVERY[r.plan.interval_weeks],
            r.plan.price_cents !== null
              ? `$${(r.plan.price_cents / 100).toFixed(2)} a month`
              : null,
            r.plan.tech_id ? names.get(r.plan.tech_id) : "Unassigned",
          ]
            .filter(Boolean)
            .join(" · ")
        : "",
    })),
  };
}

export async function runImportFor(
  t: ImportTarget,
  rows: string[][],
  mapping: ImportField[],
): Promise<{ customers: number; pools: number; plans: number; skipped: number }> {
  const { ctx, fresh, existing } = await prepare(t, rows, mapping);
  const today = localDate(new Date(), ctx.timezone);
  const records = fresh.map((r) => ({
    customer: r.customer,
    property: r.property,
    plan: r.plan
      ? {
          starts_on: firstVisitOn(r.plan.weekday, today),
          interval_weeks: r.plan.interval_weeks,
          price_cents: r.plan.price_cents,
          tech_id: r.plan.tech_id,
        }
      : null,
  }));
  if (!records.length) return { customers: 0, pools: 0, plans: 0, skipped: existing.length };
  const { data, error } = await t.db.rpc("import_customers", {
    target_company: t.companyId,
    records,
  });
  if (error) throw new Error(error.message);
  const made = data as { customers: number; pools: number; plans: number };
  return { ...made, skipped: existing.length };
}

/** After an import: map the new pools for routes, as far as today's lookups allow. */
export async function locateImported(t: ImportTarget, limit = 250): Promise<void> {
  if (!routingConfigured()) return;
  const { data } = await t.db
    .from("property")
    .select("id, address_line1, address_line2, city, state, postal_code")
    .eq("company_id", t.companyId)
    .is("geocoded_address", null)
    .is("latitude", null)
    .is("deleted_at", null)
    .limit(limit);
  for (const p of (data ?? []) as (Parameters<typeof formatAddress>[0] & { id: string })[]) {
    const address = formatAddress(p);
    const found = await geocodeAddress(t.db, t.companyId, address);
    if (!found) return; // Past today's limit: the rest are found when routes are planned.
    await t.db
      .from("property")
      .update({
        latitude: found.lat,
        longitude: found.lng,
        geocoded_address: address,
        location_source: "geocoder",
      })
      .eq("id", p.id);
  }
}
