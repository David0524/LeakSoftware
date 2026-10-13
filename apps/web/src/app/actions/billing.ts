"use server";

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { portalUrl, subscribeUrl } from "@/server/billing";
import type { FormState } from "./auth";

/** Owners: subscribe to Tidemark through Stripe Checkout. */
export async function subscribe(): Promise<FormState> {
  const office = await requireOwner();
  const company = await getCompany(office);
  let url: string;
  try {
    url = await subscribeUrl(
      { id: company.id, name: company.name },
      office.user.email ?? null,
      await siteOrigin(),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(url);
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
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(url);
}
