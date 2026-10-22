import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { AdminShop, SubscriptionEvent } from "@leakbook/core";
import { getUser } from "@/lib/auth";
import { adminClient } from "./admin";
import { isStaff } from "./leads";

// The Admin portal (owner, 2026-10-22; docs/plans/admin-portal.md). Staff are the emails in
// SUNDECK_STAFF_EMAILS and every page and action needs a session that passed two-step. All
// reads and writes here use the service role, after those checks.

export interface Staff {
  id: string;
  email: string;
}

/**
 * For portal pages: the staff person, or "two-step" when they still need to pass the code.
 * Signed-out visitors go to sign-in; other accounts to a page that says so and offers a switch.
 */
export const staffGate = cache(
  async (next = "/admin"): Promise<{ staff: Staff } | { needsTwoStep: true }> => {
    const user = await getUser();
    if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    if (!isStaff(user)) redirect("/sign-in/staff");
    if (user.aal !== "aal2") return { needsTwoStep: true };
    return { staff: { id: user.id, email: user.email!.toLowerCase() } };
  },
);

export const STAFF_ONLY = "Only Sundeck Pro staff with two-step sign-in can do this.";

/** For portal actions and downloads: the staff person and the service-role client. */
export async function requireStaff() {
  const user = await getUser();
  if (!user || !isStaff(user) || user.aal !== "aal2") throw new Error(STAFF_ONLY);
  const db = adminClient();
  if (!db) throw new Error("The server key is missing.");
  return { staff: { id: user.id, email: user.email!.toLowerCase() } as Staff, db };
}

function db() {
  const client = adminClient();
  if (!client) throw new Error("The server key is missing (SUPABASE_SERVICE_ROLE_KEY).");
  return client;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type StaffActionKind =
  | "support_start"
  | "support_end"
  | "trial_extend"
  | "demo_on"
  | "demo_off"
  | "two_step_off"
  | "password_reset"
  | "note"
  | "export";

/** Writes the staff log (public.staff_action), which no one can change afterwards. */
export async function logStaffAction(
  staff: Staff,
  action: StaffActionKind,
  about: {
    companyId?: string | null;
    companyName?: string | null;
    targetUser?: string | null;
    targetEmail?: string | null;
    reason?: string | null;
    details?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { error } = await db()
    .from("staff_action")
    .insert({
      staff_user_id: staff.id,
      staff_email: staff.email,
      action,
      company_ref: about.companyId ?? null,
      company_name: about.companyName ?? null,
      target_user: about.targetUser ?? null,
      target_email: about.targetEmail ?? null,
      reason: about.reason ?? null,
      details: about.details ?? {},
    });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const loadShops = cache(() => rpc<AdminShop[]>("admin_shops"));

export interface TeamMember {
  user_id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: "owner" | "admin" | "tech";
  status: "active" | "disabled";
  joined_at: string;
  last_sign_in_at: string | null;
  two_step: boolean;
  apps: string[];
  last_seen_at: string | null;
}

export interface ShopDetail {
  shop: AdminShop;
  team: TeamMember[];
  invites: {
    id: string;
    email: string;
    role: string;
    created_at: string;
    expires_at: string;
    token: string;
  }[];
  usage: {
    customers: number;
    pools: number;
    jobs_open: number;
    jobs_done_month: number;
    jobs_total: number;
    reports_sent: number;
    quotes_sent: number;
    quotes_accepted: number;
    invoices_sent: number;
    collected_cents: number;
    outstanding_cents: number;
    photos: number;
    storage_bytes: number;
  };
  today: Partial<Record<"email" | "narrative" | "transcribe" | "text" | "call", number>>;
  activity: {
    kind: string;
    created_at: string;
    customer_name: string | null;
    job_number: number | null;
    amount_cents: number | null;
    preview: string | null;
  }[];
  failed_messages: {
    channel: string;
    recipient: string;
    template: string;
    error: string | null;
    created_at: string;
  }[];
  notes: { id: string; staff_email: string; note: string; created_at: string }[];
  support: SupportRow[];
}

export interface SupportRow {
  id: string;
  staff_email: string;
  reason: string;
  access: "view" | "edit";
  started_at: string;
  ends_at: string;
  ended_at: string | null;
  company_ref?: string;
  company_name?: string | null;
}

export async function loadShop(id: string): Promise<ShopDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const data = await rpc<ShopDetail | null>("admin_shop", { target: id });
  return data?.shop ? data : null;
}

export interface PersonRow {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  two_step: boolean;
  shops: { company_id: string; company_name: string; role: string; status: string }[];
  apps: string[];
}

export function loadPeople(search: string) {
  return rpc<PersonRow[]>("admin_people", { search: search.slice(0, 100) || null });
}

export interface PersonDetail extends Omit<PersonRow, "apps"> {
  shops: {
    company_id: string;
    company_name: string;
    role: string;
    status: string;
    joined_at: string;
  }[];
  devices: { app: string | null; service: string; created_at: string; last_seen_at: string }[];
  invites: {
    id: string;
    token: string;
    company_id: string;
    company_name: string;
    role: string;
    expires_at: string;
    accepted_at: string | null;
    revoked_at: string | null;
  }[];
  lead: { created_at: string; contacted_at: string | null; notes: string | null } | null;
}

export async function loadPerson(id: string): Promise<PersonDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return rpc<PersonDetail | null>("admin_person", { target: id });
}

export interface Metrics {
  signups_by_week: { week: string; shops: number }[];
  jobs_by_week: { week: string; jobs: number }[];
  payments_by_month: {
    month: string;
    card_cents: number;
    bank_cents: number;
    other_cents: number;
    refunded_cents: number;
    failed: number;
  }[];
  people_active_7d: number;
  people_active_30d: number;
  people_total: number;
  shops_working_7d: number;
  shops_never_worked: number;
  trials_ended_90d: number;
  trials_converted_90d: number;
  leads_to_call: number;
  subscription_events: SubscriptionEvent[];
}

export const loadMetrics = cache(() => rpc<Metrics>("admin_metrics"));

export interface Health {
  failed_messages_24h: {
    company_id: string;
    name: string;
    n: number;
    last_at: string;
    last_error: string | null;
  }[];
  usage_today: { company_id: string; name: string; kind: string; used: number }[];
  mapbox_month: { api: string; limit: number; used: number }[];
  support_open: number;
  locked_shops: number;
}

export const loadHealth = () => rpc<Health>("admin_health");

export interface StaffActionRow {
  id: number;
  staff_email: string;
  action: StaffActionKind;
  company_ref: string | null;
  company_name: string | null;
  target_user: string | null;
  target_email: string | null;
  reason: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export async function loadStaffActions(filter: {
  companyId?: string;
  staffEmail?: string;
  limit?: number;
}): Promise<StaffActionRow[]> {
  let q = db()
    .from("staff_action")
    .select(
      "id, staff_email, action, company_ref, company_name, target_user, target_email, reason, details, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(filter.limit ?? 300);
  if (filter.companyId) q = q.eq("company_ref", filter.companyId);
  if (filter.staffEmail) q = q.eq("staff_email", filter.staffEmail);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffActionRow[];
}

export async function loadSupportSessions(limit = 200): Promise<SupportRow[]> {
  const { data, error } = await db()
    .from("support_session")
    .select(
      "id, staff_email, reason, access, started_at, ends_at, ended_at, company_ref, company:company_ref (name)",
    )
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as (SupportRow & { company: { name: string } | null })[]).map(
    ({ company, ...s }) => ({ ...s, company_name: company?.name ?? null }),
  );
}

export interface Usage {
  days: number;
  people_active: number;
  sessions: number;
  screen_ms: number;
  person_days: number;
  by_day: { day: string; people: number; ms: number }[];
  platforms: { platform: "web" | "ios" | "android"; people: number; ms: number }[];
  versions: { platform: string; version: string; people: number; last_at: string }[];
  screens: { screen: string; ms: number; views: number; people: number }[];
  features: { feature: string; n: number; people: number; shops: number; last_at: string }[];
  errors: {
    screen: string;
    detail: string | null;
    platform: string;
    n: number;
    people: number;
    last_at: string;
  }[];
  people: {
    user_id: string;
    email: string;
    name: string | null;
    ms: number;
    active_days: number;
    sessions: number;
    last_at: string;
    platforms: string[] | null;
    actions: number;
    shops: string | null;
  }[];
}

/** Usage (owner, 2026-10-22): screen time, screens, features, versions, errors. */
export function loadUsage(days: number, scope: { companyId?: string; userId?: string } = {}) {
  return rpc<Usage>("admin_usage", {
    days,
    target_company: scope.companyId ?? null,
    target_user: scope.userId ?? null,
  });
}
