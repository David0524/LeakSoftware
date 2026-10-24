import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "./admin";

// The App Review shop (owner, 2026-10-24; docs/release/PRODUCTION.md, section 9): Apple's and
// Google's reviewers sign in to a shop of their own as its owner. With company.review_shop on
// (set by scripts/review-account.mjs, never by a member), nothing the shop sends reaches a real
// person, and the flows look the same to the reviewer:
//   - Texts are recorded as sent and never handed to Twilio, as on a server without Twilio
//     keys (demo mode, twilio.ts sendText).
//   - Emails are recorded as sent and never handed to Resend, except to addresses at
//     sundeckpro.com, so Sundeck Pro can test (email.ts sendEmail and sendEmailBatch).
//   - Phone numbers can't be bought or set up, and calls aren't placed: both would reach a
//     real phone or cost money, so they're refused with a calm explanation.

/** Same wording on every platform: the apps show the server's message. */
export const REVIEW_NUMBERS_MESSAGE = "Phone numbers can’t be added to the App Review shop.";
export const REVIEW_CALLS_MESSAGE = "Calls can’t be placed from the App Review shop.";

/** The one domain the App Review shop's email still reaches. */
export const REVIEW_EMAIL_DOMAIN = "sundeckpro.com";

/** An address at sundeckpro.com itself (not a look-alike such as sundeckpro.com.evil.test). */
export function reviewDeliverable(address: string): boolean {
  const at = address.trim().toLowerCase();
  const i = at.lastIndexOf("@");
  return i > 0 && at.slice(i + 1) === REVIEW_EMAIL_DOMAIN;
}

/** The provider id a held message is recorded with, like demo mode's `demo-…`. */
export const heldId = () => `review-${randomUUID()}`;

/**
 * Whether this is the App Review shop, read as the server. Without a service key (local
 * development) there's no way to tell, and nothing is sent anyway (no Twilio or Resend keys
 * either). A failed read throws: an unknown shop never gets through by mistake.
 */
export async function isReviewShop(
  companyId: string | null | undefined,
  db: SupabaseClient | null = adminClient(),
): Promise<boolean> {
  return (await reviewShops([companyId], db)).size > 0;
}

/** The App Review shops among these companies (one read). */
export async function reviewShops(
  companyIds: (string | null | undefined)[],
  db: SupabaseClient | null = adminClient(),
): Promise<Set<string>> {
  const ids = [...new Set(companyIds.filter((id): id is string => !!id))];
  if (!ids.length || !db) return new Set();
  const { data, error } = await db
    .from("company")
    .select("id")
    .in("id", ids)
    .eq("review_shop", true);
  if (error) throw new Error(`Couldn’t check the shop: ${error.message}`);
  return new Set((data ?? []).map((r) => r.id as string));
}

/**
 * What of an App Review shop's email may still go: only its sundeckpro.com recipients, the
 * first of them as `to`. Null when there are none (the email is recorded, not sent).
 */
export function reviewRecipients<T extends { to: string; cc?: string[] }>(email: T): T | null {
  const keep = [email.to, ...(email.cc ?? [])].filter(reviewDeliverable);
  if (!keep.length) return null;
  const [to, ...cc] = keep;
  return { ...email, to: to!, cc: email.cc ? cc : undefined };
}
