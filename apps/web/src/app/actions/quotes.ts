"use server";

import { adminClient } from "@/server/admin";
import { notifyQuoteAccepted } from "@/server/notify-events";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getOffice, requireOwner } from "@/lib/auth";
import { SIGNER_NAME_MAX } from "@/lib/limits";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { publicClient } from "@/server/reports";
import {
  CheckoutRefused,
  PaymentsNotConfigured,
  depositCheckout,
  type CheckoutStart,
  onboardingLink,
  type PaymentAccount,
} from "@/server/stripe";
import { getCompany } from "@/lib/data";
import type { FormState, PayState } from "./auth";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------------------------------------------------------------------------
// Customer quote page (/q/{token}): no sign-in
// ---------------------------------------------------------------------------

export async function acceptQuote(_: FormState, form: FormData): Promise<FormState> {
  const token = text(form, "token");
  if (text(form, "name").length > SIGNER_NAME_MAX)
    return { error: `Keep your name under ${SIGNER_NAME_MAX} characters.` };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  const { data, error } = await publicClient().rpc("accept_quote_by_link", {
    link_token: token,
    signer_name: text(form, "name"),
    agreed: form.get("agree") === "on",
    from_ip: ip,
    user_agent: h.get("user-agent"),
  });
  if (error) return { error: error.message };
  // The team hears about it (owner, 2026-10-19: notifications), once.
  const admin = adminClient();
  if (admin && (data as { already?: boolean } | null)?.already === false) {
    const { data: link } = await admin
      .from("share_link")
      .select("quote_id")
      .eq("token", token)
      .maybeSingle();
    if (link?.quote_id) await notifyQuoteAccepted(admin, link.quote_id as string);
  }
  revalidatePath(`/q/${token}`);
  return { message: "Accepted. Thank you!" };
}

export async function payDeposit(_: PayState, form: FormData): Promise<PayState> {
  const token = text(form, "token");
  let start: CheckoutStart;
  try {
    // With the shop's card fee on, the customer chose card or bank (owner, 2026-10-19).
    const method = text(form, "method");
    start = await depositCheckout(
      token,
      await siteOrigin(),
      undefined,
      undefined,
      undefined,
      method === "card" || method === "bank" ? method : null,
    );
  } catch (e) {
    if (e instanceof CheckoutRefused || e instanceof PaymentsNotConfigured)
      return { error: e.message };
    return { error: "Couldn’t start the payment. Please try again in a moment." };
  }
  // Embedded: the page shows Stripe's form in place. Otherwise, off to Stripe's page.
  if (start.kind === "embedded") return { checkout: start };
  redirect(start.url);
}

// ---------------------------------------------------------------------------
// Office
// ---------------------------------------------------------------------------

export interface SendQuoteState extends FormState {
  link?: string;
}

export async function sendQuoteAction(_: SendQuoteState, form: FormData): Promise<SendQuoteState> {
  await getOffice();
  const { data, error } = await (
    await createClient()
  ).rpc("send_quote", {
    target_quote: text(form, "quote"),
  });
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${text(form, "job")}`);
  return {
    message: "Quote sent. Copy the link for the customer.",
    link: `${await siteOrigin()}/q/${(data as { token: string }).token}`,
  };
}

/** Owners only: start or continue Stripe onboarding (connecting the shop's account). */
export async function setUpPayments(): Promise<FormState> {
  const office = await requireOwner();
  const company = await getCompany(office);
  const { data } = await (
    await createClient()
  )
    .from("stripe_account")
    .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
    .eq("company_id", office.company.id)
    .maybeSingle();
  let url: string;
  try {
    url = await onboardingLink(
      { id: company.id, name: company.name, email: (company.email as string | null) ?? null },
      (data as PaymentAccount | null) ?? null,
      await siteOrigin(),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(url);
}
