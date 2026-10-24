"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { adminClient } from "@/server/admin";
import { createClient } from "@/lib/supabase/server";
import {
  BillingNotConfigured,
  finishOnboarding,
  subscribeCheckout,
  type SubscribeStart,
} from "@/server/billing";
import type { FormState, SubscribeState } from "./auth";

// A new shop's trial page (/welcome), straight after sign-up (owner, 2026-10-24). The shop is
// read-only until its card is in (or a demo code is used); then setup is done.

/**
 * Owners: add the card. With the publishable key, Stripe's form is embedded on /welcome (owner,
 * 2026-10-24) and this returns its client secret; without it, Stripe's page. Either way Stripe
 * comes back to /welcome/done.
 */
export async function startCheckout(): Promise<SubscribeState> {
  const office = await requireOwner();
  const company = await getCompany(office);
  let start: SubscribeStart;
  try {
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
 * Owners: a demo code instead of a card (owner, 2026-10-16: VIP26). A valid code makes the
 * shop a demo shop (no card, no charge), and setup is done.
 */
export async function redeemCode(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { fields: { code: "Enter your code." } };
  const { error } = await (
    await createClient()
  ).rpc("redeem_access_code", {
    target_company: office.company.id,
    code,
  });
  if (error)
    return {
      fields: { code: error.code === "22023" ? "That code isn’t valid." : error.message },
      values: { code },
    };
  const admin = adminClient();
  if (admin) await finishOnboarding(admin, office.company.id);
  redirect("/welcome/done");
}
