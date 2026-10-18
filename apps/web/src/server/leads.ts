import "server-only";
import { parseServices, toE164 } from "@leakbook/core";
import type { SignedInUser } from "@/lib/auth";
import { adminClient } from "./admin";

// Leads (owner, 2026-10-16): Sundeck Pro's own call list of people who started signing up.
// Kept in public.signup_lead, which only the server can read or write.

export interface LeadInput {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  services?: string;
  userId?: string;
}

const clip = (v: string | undefined, n = 200) =>
  v ? v.trim().slice(0, n) || undefined : undefined;

/** Saves or updates the lead for this email; fields left empty keep what was saved. */
export async function saveLead(input: LeadInput): Promise<void> {
  const admin = adminClient();
  const email = input.email.trim().toLowerCase();
  if (!admin || !/^\S+@\S+\.\S+$/.test(email) || email.length > 200) return;
  const row: Record<string, unknown> = { email, updated_at: new Date().toISOString() };
  const name = clip(input.name);
  const company = clip(input.company);
  const phone = input.phone ? (toE164(input.phone) ?? clip(input.phone, 40)) : undefined;
  const services = parseServices(input.services);
  if (name) row.name = name;
  if (company) row.company_name = company;
  if (phone) row.phone = phone;
  if (services) row.services = services;
  if (input.userId) row.user_id = input.userId;
  await admin.from("signup_lead").upsert(row, { onConflict: "email" });
}

/**
 * Sundeck Pro staff: the emails in SUNDECK_STAFF_EMAILS (comma-separated, set on Vercel; not in
 * the repository, which is public). TIDEMARK_STAFF_EMAILS, its name before the rename
 * (2026-10-18), still works.
 */
export function isStaff(user: SignedInUser | null): boolean {
  if (!user?.email) return false;
  const staff = (process.env.SUNDECK_STAFF_EMAILS ?? process.env.TIDEMARK_STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return staff.includes(user.email.toLowerCase());
}
