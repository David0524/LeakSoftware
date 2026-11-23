import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/origin";

/** What the referral entries on More and in the account menu show (owner, 2026-11-23). */
export interface ReferralOffer {
  code: string;
  used: number;
  earned: number;
  /** The site the share message's sign-up link points to (referralShareText adds /sign-up?code=). */
  origin: string;
}

/** `referral_summary`'s answer, or null when there is no code to share. */
export function referralFromSummary(
  data: unknown,
): { code: string; used: number; earned: number } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { code?: unknown; used?: unknown; earned?: unknown };
  if (typeof row.code !== "string" || !row.code.trim()) return null;
  const count = (n: unknown) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };
  return { code: row.code, used: count(row.used), earned: count(row.earned) };
}

/**
 * The shop's referral code for its owner, the same as Settings › Sundeck Pro Billing reads
 * (`public.referral_summary`, owners only). Never throws: admins, techs, a shop without a code,
 * or any failure give null, and the entry simply isn't shown. Demo shops are included, so an
 * owner trying the demo sees it.
 */
export async function referralOfferFor(
  office: { isOwner: boolean; company: { id: string } },
  db: SupabaseClient,
): Promise<ReferralOffer | null> {
  if (!office.isOwner) return null;
  try {
    const { data, error } = await db.rpc("referral_summary", {
      target_company: office.company.id,
    });
    const summary = error ? null : referralFromSummary(data);
    if (!summary) return null;
    return { ...summary, origin: await siteOrigin() };
  } catch {
    return null;
  }
}
