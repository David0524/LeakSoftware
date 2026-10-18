import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./admin";

// Guards for work Sundeck Pro pays for (texts, calls, email, AI drafts, transcription), from the
// security audit (2026-10-17): a read-only (unpaid) shop starts none of it, and every shop has
// a daily allowance that only the server counts.

export type UsageKind = "email" | "narrative" | "transcribe" | "text" | "call";

const DEFAULT_LIMITS: Record<UsageKind, number> = {
  email: 300,
  narrative: 60,
  transcribe: 200,
  text: 500,
  call: 100,
};

/** A shop's daily allowance; DAILY_LIMIT_<KIND> overrides it (e.g. DAILY_LIMIT_EMAIL=500). */
export function dailyLimit(kind: UsageKind): number {
  const n = Number(process.env[`DAILY_LIMIT_${kind.toUpperCase()}`]);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_LIMITS[kind];
}

/**
 * True when the shop can start new work: checked through the member's own client, so it is
 * the same lock the database applies to their writes. Fails closed.
 */
export async function shopWritable(user: SupabaseClient, companyId: string): Promise<boolean> {
  const { data, error } = await user.rpc("company_access", { target_company: companyId });
  return !error && !!data && !(data as { locked?: boolean }).locked;
}

/**
 * Count `howMany` uses of the shop's daily allowance. False when it would go over. Without a
 * service key (local development) nothing is counted.
 */
export async function takeAllowance(
  companyId: string,
  kind: UsageKind,
  howMany = 1,
  db: SupabaseClient | null = adminClient(),
): Promise<boolean> {
  if (!db) return true;
  const { data, error } = await db.rpc("use_allowance", {
    target_company: companyId,
    use_kind: kind,
    how_many: howMany,
    day_limit: dailyLimit(kind),
  });
  if (error) throw new Error(error.message);
  return data === true;
}

/** Before an email from a member: the shop isn't read-only and has allowance left. */
export async function emailRefusal(
  user: SupabaseClient,
  companyId: string,
  recipients: number,
): Promise<string | null> {
  if (!(await shopWritable(user, companyId))) return READ_ONLY_MESSAGE;
  if (!(await takeAllowance(companyId, "email", Math.max(1, recipients)))) return LIMIT_MESSAGE;
  return null;
}

/** The customer's other addresses: valid ones, once each, at most 5, without the main one. */
export function ccList(emails: readonly string[] | null | undefined, to: string): string[] {
  return [...new Set((emails ?? []).map((e) => e.trim().toLowerCase()))]
    .filter((e) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(e) && e !== to.toLowerCase())
    .slice(0, 5);
}

export const READ_ONLY_MESSAGE =
  "This shop is read-only until its Sundeck Pro subscription is paid.";
export const LIMIT_MESSAGE = "Your shop has reached today’s limit for this. It resets tomorrow.";
