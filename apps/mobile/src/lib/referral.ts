import type { SupabaseClient } from "@supabase/supabase-js";
import { referShareMessage, referralLink, showsReferRow } from "@leakbook/core";

// Refer a Pool Company (owner, 2026-11-23; core refer.ts): the shop's referral code is read from
// the server as the signed-in owner through `referral_summary`, like the Dashboard (the
// subscription row isn't synced to phones). No React here, so it can be tested.

type Rpc = Pick<SupabaseClient, "rpc">;

export interface ReferShare {
  link: string;
  message: string;
}

/**
 * What More's Refer a Pool Company row shares, or null when it doesn't show: not an owner (the
 * server isn't asked), no code, no website, or the server couldn't be reached. Never throws.
 */
export async function fetchReferShare(
  supabase: Rpc,
  companyId: string,
  role: string | null | undefined,
  webUrl: string | null | undefined,
): Promise<ReferShare | null> {
  if (role !== "owner" || !companyId) return null;
  try {
    const { data, error } = await supabase.rpc("referral_summary", { target_company: companyId });
    if (error) return null;
    const code = (data as { code?: unknown } | null)?.code;
    const text = typeof code === "string" ? code : null;
    const link = referralLink(webUrl, text);
    if (!showsReferRow(role, text) || !link) return null;
    return { link, message: referShareMessage(link) };
  } catch {
    return null;
  }
}
