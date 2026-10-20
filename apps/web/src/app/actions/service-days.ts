"use server";

import { revalidatePath } from "next/cache";
import {
  moveServiceDay,
  planRepeat,
  propertyLocation,
  serviceDays,
  suggestServiceDays,
  workDay,
  type DaySuggestion,
  type ServicePlan,
} from "@leakbook/core";
import { requireManager } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { driveTimes } from "@/server/routing";
import { routeContext } from "@/server/route-days";

// Routes (owner, 2026-10-20, docs/plans/route-maps.md part 3): which weekday each pool customer
// is serviced on, and by whom. Saving a plan's day or tech re-makes its coming visits
// (app.service_plan_changed). Owners and admins.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RouteDayResult {
  error?: string;
  message?: string;
  /** What changed plans were before, for Undo. */
  undo?: PlanUndo[];
}

export interface PlanUndo {
  id: string;
  starts_on: string;
  weekdays: number[] | null;
  assigned_user_id: string | null;
}

/** A plan on the Routes view: its customer, pool, days and tech. */
export interface RouteCustomer {
  planId: string;
  customer: string;
  address: string;
  location: { lat: number; lng: number } | null;
  techId: string | null;
  days: number[];
  durationMin: number;
  /** "days" (several a week), "weekly", "biweekly" or "monthly". */
  repeat: string;
  /** When the plan was made: Customers to Add lists the newest first. */
  createdAt: string | null;
  /** Whose plan it is: Open Plan goes to their page. */
  customerId: string | null;
}

type PlanRow = ServicePlan & {
  property: {
    address_line1: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  customer: { name: string | null } | null;
  created_at?: string | null;
};

/** Every plan that's running (not paused or ended), for the Routes view. */
export async function loadRouteCustomers(): Promise<RouteCustomer[]> {
  const office = await requireManager();
  const ctx = await routeContext(office);
  const db = await createClient();
  const { data } = await db
    .from("service_plan")
    .select(
      "*, property:property!service_plan_property_id_company_id_fkey(address_line1, city, latitude, longitude), customer:customer!service_plan_customer_id_company_id_fkey(name)",
    )
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .eq("paused", false);
  return ((data ?? []) as PlanRow[])
    .filter((p) => !p.ends_on || p.ends_on >= ctx.today)
    .map((p) => ({
      planId: p.id,
      customer: p.customer?.name ?? "Customer",
      address: [p.property?.address_line1, p.property?.city].filter(Boolean).join(", "),
      location: propertyLocation(p.property),
      techId: p.assigned_user_id ?? null,
      days: serviceDays(p),
      durationMin: p.duration_minutes,
      repeat: planRepeat(p),
      createdAt: p.created_at ?? null,
      customerId: p.customer_id ?? null,
    }))
    .sort((a, b) => a.customer.localeCompare(b.customer));
}

/** Service this plan on `to` (instead of `from`), by this tech. */
export async function setServiceDay(input: {
  plan: string;
  from: number | null;
  to: number;
  tech: string;
}): Promise<RouteDayResult> {
  if (
    !UUID.test(input.plan) ||
    !UUID.test(input.tech) ||
    !Number.isInteger(input.to) ||
    input.to < 0 ||
    input.to > 6
  )
    return { error: "That move isn’t possible." };
  const office = await requireManager();
  const [ctx, team] = await Promise.all([routeContext(office), getTeam(office)]);
  if (!team.some((t) => t.user_id === input.tech && t.status === "active"))
    return { error: "Pick someone on the team." };
  const db = await createClient();
  const { data: plan } = await db
    .from("service_plan")
    .select("*")
    .eq("id", input.plan)
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!plan) return { error: "This plan is gone. Refresh the page." };
  const p = plan as ServicePlan;
  const from = input.from ?? serviceDays(p)[0]!;
  const row = { ...moveServiceDay(p, from, input.to, ctx.today), assigned_user_id: input.tech };
  const { error } = await db
    .from("service_plan")
    .update(row)
    .eq("id", p.id)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  refresh();
  return {
    message: "Moved. Its coming visits moved too.",
    undo: [
      {
        id: p.id,
        starts_on: p.starts_on,
        weekdays: p.weekdays ?? null,
        assigned_user_id: p.assigned_user_id ?? null,
      },
    ],
  };
}

/** Undo: put plans back on their days and techs (their coming visits follow). */
export async function undoServiceDays(rows: PlanUndo[]): Promise<RouteDayResult> {
  if (!Array.isArray(rows) || rows.length > 400 || !rows.every((r) => UUID.test(r?.id ?? "")))
    return { error: "That can’t be undone." };
  const office = await requireManager();
  const db = await createClient();
  for (const r of rows) {
    const { error } = await db
      .from("service_plan")
      .update({
        starts_on: r.starts_on,
        weekdays: r.weekdays,
        assigned_user_id: r.assigned_user_id,
      })
      .eq("id", r.id)
      .eq("company_id", office.company.id);
    if (error) return { error: error.message };
  }
  refresh();
  return { message: "Put back as it was." };
}

/**
 * Suggest Days for these plans (Customers to Add, or a tech's whole route): nothing is saved
 * until Keep.
 */
export async function suggestDays(input: {
  plans: string[];
  techs: string[];
}): Promise<{ error?: string; suggestions?: DaySuggestion[]; left?: string[] }> {
  if (
    !Array.isArray(input.plans) ||
    input.plans.length > 400 ||
    !input.plans.every((id) => UUID.test(id)) ||
    !Array.isArray(input.techs) ||
    !input.techs.every((id) => UUID.test(id))
  )
    return { error: "Pick the customers and techs to plan." };
  const office = await requireManager();
  const [ctx, team, all] = await Promise.all([
    routeContext(office),
    getTeam(office),
    loadRouteCustomers(),
  ]);
  const techs = input.techs.filter((id) =>
    team.some((t) => t.user_id === id && t.status === "active"),
  );
  if (!techs.length) return { error: "Pick someone on the team." };
  const wanted = new Set(input.plans);
  const asPlan = (c: RouteCustomer) => ({
    id: c.planId,
    techId: c.techId,
    days: c.days,
    location: c.location,
    durationMin: c.durationMin,
  });
  const place = all.filter((c) => wanted.has(c.planId)).map(asPlan);
  const keep = all.filter((c) => !wanted.has(c.planId)).map(asPlan);
  const points = [ctx.depot, ...all.map((c) => c.location)].filter(
    (p): p is { lat: number; lng: number } => !!p,
  );
  const drive = await driveTimes(await createClient(), office.company.id, points, { live: false });
  return suggestServiceDays({
    place,
    keep,
    techs,
    workDays: ctx.settings.workDays,
    depot: ctx.depot,
    day: workDay(ctx.settings),
    drive,
  });
}

/** Keep: save each suggested day and tech. */
export async function keepSuggestedDays(list: DaySuggestion[]): Promise<RouteDayResult> {
  if (!Array.isArray(list) || list.length > 400) return { error: "Nothing to keep." };
  const undo: PlanUndo[] = [];
  for (const s of list) {
    const r = await setServiceDay({ plan: s.id, from: null, to: s.day, tech: s.techId });
    if (r.error) {
      if (undo.length) await undoServiceDays(undo);
      return { error: r.error };
    }
    undo.push(...(r.undo ?? []));
  }
  refresh();
  return {
    undo,
    message: `Saved ${list.length} ${list.length === 1 ? "customer’s day" : "customers’ days"}. Their coming visits moved too.`,
  };
}

function refresh() {
  revalidatePath("/schedule");
  revalidatePath("/today");
  revalidatePath("/customers", "layout");
}
