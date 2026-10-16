"use server";

import { redirect } from "next/navigation";
import { parseOnboardingAnswers } from "@leakbook/core";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { adminClient } from "@/server/admin";
import {
  BillingNotConfigured,
  billingConfigured,
  finishOnboarding,
  subscribeUrl,
} from "@/server/billing";
import type { FormState } from "./auth";

// New-shop onboarding (owner, 2026-10-16). The shop is read-only until its card is in, so
// the answers are kept on the subscription by the server and applied after Checkout.

/** Owners: keep the onboarding answers (validated) for after the card. */
export async function saveOnboarding(raw: unknown): Promise<{ error?: string }> {
  const office = await requireOwner();
  const answers = parseOnboardingAnswers(raw);
  if (!answers) return { error: "Something’s missing. Go back a step and try again." };
  const admin = adminClient();
  if (!admin) return {};
  const { error } = await admin
    .from("subscription")
    .update({ onboarding: answers })
    .eq("company_id", office.company.id);
  return error ? { error: "Couldn’t save. Check your connection and try again." } : {};
}

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

/** Servers without Stripe billing (development, tests): finish without a card. */
export async function finishWithoutCard(): Promise<FormState> {
  const office = await requireOwner();
  if (billingConfigured()) return { error: "Add a card to start your free trial." };
  const admin = adminClient();
  if (admin) await finishOnboarding(admin, office.company.id);
  redirect("/welcome/done");
}
