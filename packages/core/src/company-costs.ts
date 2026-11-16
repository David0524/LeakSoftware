import type { Cents } from "./money";

// Sundeck Pro's own costs (owner, 2026-11-16: "a company finances section that includes all of
// our finances … allow us to add certain expenses and keep track of which one of the owners
// paid for it, David, Cole, or the company"). Rows in public.company_cost, staff only.

export const PAYERS = ["david", "cole", "company"] as const;
export type Payer = (typeof PAYERS)[number];
export const PAYER_LABELS: Record<Payer, string> = {
  david: "David",
  cole: "Cole",
  company: "Company",
};

export const COST_CATEGORIES = [
  "software",
  "processing",
  "app_stores",
  "marketing",
  "legal",
  "equipment",
  "other",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  software: "Software and services",
  processing: "Card processing",
  app_stores: "App stores",
  marketing: "Marketing",
  legal: "Legal and fees",
  equipment: "Equipment",
  other: "Other",
};

export const REPEATS = ["once", "monthly", "yearly"] as const;
export type Repeats = (typeof REPEATS)[number];
export const REPEAT_LABELS: Record<Repeats, string> = {
  once: "One Time",
  monthly: "Monthly",
  yearly: "Yearly",
};

export interface CompanyCost {
  id: string;
  name: string;
  category: CostCategory;
  /** Null for a service whose price hasn't been entered yet. */
  amount_cents: Cents | null;
  repeats: Repeats;
  /** The day it was paid (one time), or the first charge (monthly, yearly). YYYY-MM-DD. */
  spent_on: string;
  /** The last day a service ran, when it was canceled. YYYY-MM-DD. */
  ended_on: string | null;
  paid_by: Payer;
  note: string | null;
  created_by: string;
  created_at: string;
}

/** A YYYY-MM-DD date as a UTC midnight. */
function day(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

/** A recurring cost that is running on `today` (YYYY-MM-DD). */
export function isRunning(c: CompanyCost, today: string): boolean {
  return c.repeats !== "once" && c.spent_on <= today && (!c.ended_on || c.ended_on >= today);
}

/** What a running cost comes to in a month: monthly as is, yearly over 12. */
export function monthlyShareCents(c: CompanyCost): Cents {
  if (c.amount_cents === null || c.repeats === "once") return 0;
  return c.repeats === "monthly" ? c.amount_cents : Math.round(c.amount_cents / 12);
}

/** What the running services cost a month, now. */
export function monthlyCostsCents(costs: CompanyCost[], today: string): Cents {
  return costs.filter((c) => isRunning(c, today)).reduce((n, c) => n + monthlyShareCents(c), 0);
}

/**
 * The days a cost was charged from `from` through `to` (YYYY-MM-DD, both included): its day for
 * one time; every month or year on the day of its first charge (the month's last day when the
 * month is shorter) for a service, until it ended.
 */
export function chargeDays(c: CompanyCost, from: string, to: string): string[] {
  const last = c.ended_on && c.ended_on < to ? c.ended_on : to;
  if (c.repeats === "once") return c.spent_on >= from && c.spent_on <= last ? [c.spent_on] : [];
  const start = day(c.spent_on);
  const step = c.repeats === "monthly" ? 1 : 12;
  const out: string[] = [];
  for (let i = 0; i < 1200; i += step) {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m, Math.min(start.getUTCDate(), daysIn)))
      .toISOString()
      .slice(0, 10);
    if (d > last) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** What a cost came to from `from` through `to`. A service without a price counts nothing. */
export function spentCents(c: CompanyCost, from: string, to: string): Cents {
  if (c.amount_cents === null) return 0;
  return c.amount_cents * chargeDays(c, from, to).length;
}

/** What each of David, Cole and the company paid from `from` through `to`. */
export function paidBy(costs: CompanyCost[], from: string, to: string): Record<Payer, Cents> {
  const out: Record<Payer, Cents> = { david: 0, cole: 0, company: 0 };
  for (const c of costs) out[c.paid_by] += spentCents(c, from, to);
  return out;
}

/**
 * Stripe's card fees on our subscriptions, estimated: 2.9% + 30¢ on each shop's monthly charge
 * (Stripe's standard US card price). Payments shops collect through Stripe Connect are charged
 * to the shops, not to us.
 */
export function cardFeesCents(monthlyCharges: Cents[]): Cents {
  return monthlyCharges.filter((c) => c > 0).reduce((n, c) => n + Math.round(c * 0.029) + 30, 0);
}

/** Running services first (by name), then ended ones. */
export function sortServices(costs: CompanyCost[], today: string): CompanyCost[] {
  return costs
    .filter((c) => c.repeats !== "once")
    .sort(
      (a, b) =>
        Number(isRunning(b, today)) - Number(isRunning(a, today)) || a.name.localeCompare(b.name),
    );
}

/** One-time expenses, newest first. */
export function sortExpenses(costs: CompanyCost[]): CompanyCost[] {
  return costs
    .filter((c) => c.repeats === "once")
    .sort(
      (a, b) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at),
    );
}
