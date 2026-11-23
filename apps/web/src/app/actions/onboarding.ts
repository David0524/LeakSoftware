"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { adminClient } from "@/server/admin";
import { createClient } from "@/lib/supabase/server";
import {
  BillingNotConfigured,
  finishOnboarding,
  pickTeamSize,
  subscribeCheckout,
  type SubscribeStart,
} from "@/server/billing";
import type { FormState, SubscribeState } from "./auth";

// A new shop's trial page (/welcome), straight after sign-up (owner, 2026-10-24). The shop is
// read-only until its card is in (or a demo code is used); then setup is done.

/**
 * Owners: add the card, priced for the team size picked on the page (owner, 2026-11-12). With
 * the publishable key, Stripe's form is embedded on /welcome (owner, 2026-10-24) and this
 * returns its client secret; without it, Stripe's page. Either way Stripe comes back to
 * /welcome/done.
 */
export async function startCheckout(teamSize: number): Promise<SubscribeState> {
  const office = await requireOwner();
  const company = await getCompany(office);
  let start: SubscribeStart;
  try {
    const wrong = await pickTeamSize(company.id, teamSize);
    if (wrong) return { error: wrong };
    start = await subscribeCheckout(
      { id: company.id, name: company.name },
      office.user.email ?? null,
      await siteOrigin(),
      undefined,
      undefined,
      "welcome",
    );
  } catch (e) {
    return {
      error:
        e instanceof BillingNotConfigured
          ? e.message
          : "Couldn’t open the card form. Try again in a moment.",
    };
  }
  if (start.kind === "embedded") return { clientSecret: start.clientSecret };
  redirect(start.url);
}

/**
 * Owners: a code, from the trial page or Settings › Sundeck Pro Billing before subscribing.
 * One field takes every kind (owner, 2026-11-23): a demo code makes the shop a demo shop (no
 * card, no charge; owner, 2026-10-16: VIP26) and setup is done; a promo code or another shop's
 * referral code (its name) changes the trial and price, and the page shows the offer.
 */
export async function redeemCode(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const code = String(form.get("code") ?? "").trim();
  const from = form.get("from") === "billing" ? "billing" : "welcome";
  if (!code) return { fields: { code: "Enter your code." } };
  const { data, error } = await (
    await createClient()
  ).rpc("redeem_code", {
    target_company: office.company.id,
    code,
  });
  if (error)
    return {
      // The database's refusals are written for owners ("That code isn’t valid.").
      fields: {
        code: error.code === "22023" ? error.message : "Couldn’t check the code. Try again.",
      },
      values: { code },
    };
  if ((data as { kind?: string } | null)?.kind === "demo") {
    const admin = adminClient();
    if (admin) await finishOnboarding(admin, office.company.id);
    if (from === "welcome") redirect("/welcome/done");
  }
  revalidatePath(from === "billing" ? "/settings/billing" : "/welcome");
  return { message: "applied" };
}
