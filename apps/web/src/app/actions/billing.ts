"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { friendlyError } from "@leakbook/core";
import {
  logPriceSyncError,
  pickTeamSize,
  portalUrl,
  subscribeCheckout,
  syncSubscriptionPrice,
  type SubscribeStart,
} from "@/server/billing";
import type { FormState, SubscribeState } from "./auth";

/**
 * Owners: subscribe to Sundeck Pro through Stripe Checkout for the team size picked on the page
 * (owner, 2026-11-12), embedded on the billing page when the publishable key is set (its client
 * secret comes back), else on Stripe's page.
 */
export async function subscribe(teamSize: number): Promise<SubscribeState> {
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
    );
  } catch (e) {
    return { error: friendlyError(e) };
  }
  if (start.kind === "embedded") return { clientSecret: start.clientSecret };
  redirect(start.url);
}

/**
 * Owners: the team size the shop is billed for (owner, 2026-11-12), from Sundeck Pro Billing.
 * A subscribed shop's price changes on its next bill, prorated.
 */
export async function setTeamSize(teamSize: number): Promise<FormState> {
  const office = await requireOwner();
  try {
    const wrong = await pickTeamSize(office.company.id, teamSize);
    if (wrong) return { error: wrong };
    await syncSubscriptionPrice(office.company.id).catch(logPriceSyncError);
  } catch (e) {
    return { error: friendlyError(e) };
  }
  revalidatePath("/settings/billing");
  return {};
}

/** Owners: Stripe's billing portal (card, receipts, cancel). */
export async function manageBilling(): Promise<FormState> {
  const office = await requireOwner();
  const { data } = await (
    await createClient()
  )
    .from("subscription")
    .select("stripe_customer_id")
    .eq("company_id", office.company.id)
    .maybeSingle();
  if (!data?.stripe_customer_id) return { error: "Subscribe first." };
  let url: string;
  try {
    url = await portalUrl(data.stripe_customer_id as string, await siteOrigin());
  } catch (e) {
    return { error: friendlyError(e) };
  }
  redirect(url);
}
