"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { adminClient } from "@/server/admin";
import { createClient } from "@/lib/supabase/server";
import { BillingNotConfigured, finishOnboarding, subscribeUrl } from "@/server/billing";
import type { FormState } from "./auth";

// A new shop's trial page (/welcome), straight after sign-up (owner, 2026-10-24). The shop is
// read-only until its card is in (or a demo code is used); then setup is done.

/** Owners: add the card on Stripe's page; it comes back to /welcome/done. */
export async function startCheckout(): Promise<FormState> {
  const office = await requireOwner();
  const company = await getCompany(office);
  let url: string;
  try {
    url = await subscribeUrl(
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
          : "Couldn’t open the card page. Try again in a moment.",
    };
  }
  redirect(url);
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
