import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  linkCode,
  offerFromLookup,
  pendingSignUpCode,
  SIGN_UP_CODE_KEY,
  SIGN_UP_CODE_SHOP_KEY,
  type CodeOffer,
} from "@leakbook/core";
import { adminClient } from "./admin";

// A sign-up link that carries a code (owner, 2026-11-23: "Yes do that"):
// /sign-up?code=CANNONBALL90, from the meetup's handout card.
//
// 1. The sign-up page asks the database what the code gives (public.code_offer, server key
//    only: one code's offer, never a list) and shows it. Anything else shows nothing.
// 2. Start Free Trial keeps the code in the account's user metadata (promo_code), which comes
//    through the email confirmation like the rest of the sign-up answers.
// 3. When that person makes their shop (at once, or on /setup after confirming), the shop's id
//    is added (promo_company), so the code is only ever for the shop they made, never a team
//    they join by invite.
// 4. The trial page applies it through public.redeem_code, as if typed in the code field, then
//    clears it; a refusal shows in that field.

/** What a link's code gives, for the sign-up page; null when it gives nothing (or no server key). */
export async function lookUpSignUpCode(
  raw: unknown,
  db: SupabaseClient | null = adminClient(),
): Promise<CodeOffer | null> {
  const code = linkCode(raw);
  if (!code || !db) return null;
  const { data, error } = await db.rpc("code_offer", { code });
  if (error) {
    // Logged, not shown: the person can still sign up and enter the code later.
    console.error("[sign-up] couldn't look up a link's code:", error.message);
    return null;
  }
  return offerFromLookup(data);
}

/** Once per page render: the sign-up page's intro and form ask for the same code. */
export const signUpCodeOffer = cache((raw: string | null) => lookUpSignUpCode(raw));

/**
 * The person just made their shop: the code they signed up with (if any) is for this shop.
 * `metadata` is the account's user metadata; `code` the form's, when it came with this request.
 */
export async function keepSignUpCodeFor(
  supabase: SupabaseClient,
  companyId: string,
  metadata: Record<string, unknown> | null | undefined,
  code: string | null = null,
): Promise<void> {
  const carried = code ?? linkCode(metadata?.[SIGN_UP_CODE_KEY]);
  if (!carried) return;
  const { error } = await supabase.auth.updateUser({
    data: { [SIGN_UP_CODE_KEY]: carried, [SIGN_UP_CODE_SHOP_KEY]: companyId },
  });
  if (error) console.error("[sign-up] couldn't keep the code for the new shop:", error.message);
}

export type SignUpCodeResult =
  { kind: "none" | "applied" | "demo" } | { kind: "refused"; code: string; error: string };

/**
 * The trial page: applies the code the owner signed up with to the shop they made, once,
 * through the same path as the code field (public.redeem_code, owners only, before
 * subscribing). Fresh metadata from the auth server, not the session's copy, which keeps the
 * code until the session refreshes.
 */
export async function applySignUpCode(
  supabase: SupabaseClient,
  companyId: string,
): Promise<SignUpCodeResult> {
  const { data: auth } = await supabase.auth.getUser();
  const code = pendingSignUpCode(auth.user?.user_metadata, companyId);
  if (!code) return { kind: "none" };
  const { data, error } = await supabase.rpc("redeem_code", { target_company: companyId, code });
  // Tried once, whatever the answer: a refusal shows in the code field, to apply by hand.
  const { error: clearError } = await supabase.auth.updateUser({
    data: { [SIGN_UP_CODE_KEY]: null, [SIGN_UP_CODE_SHOP_KEY]: null },
  });
  if (clearError) console.error("[sign-up] couldn't clear the applied code:", clearError.message);
  if (error)
    return {
      kind: "refused",
      code,
      // The database's refusals are written for owners ("That code isn’t valid."), as in the
      // code field.
      error: error.code === "22023" ? error.message : "Couldn’t check the code. Try again.",
    };
  return (data as { kind?: string } | null)?.kind === "demo"
    ? { kind: "demo" }
    : { kind: "applied" };
}
