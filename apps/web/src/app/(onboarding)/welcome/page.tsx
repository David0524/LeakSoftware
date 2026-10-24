import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { companyServices, mustFinishSetup } from "@leakbook/core";
import { TrialOffer } from "@/components/trial-offer";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = { title: "Start Your Free Trial · Sundeck Pro" };

/**
 * A new shop's owner comes here straight from sign-up (owner, 2026-10-24: no questionnaire
 * first): the trial's price and the card, then into the app.
 */
export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="flex-1" aria-label="Loading" />}>
      <WelcomeBody />
    </Suspense>
  );
}

async function WelcomeBody() {
  const office = await getOffice();
  const [access, company] = await Promise.all([getAccess(office), getCompany(office)]);
  if (!mustFinishSetup(access, office.company.role)) redirect("/home");
  const supabase = await createClient();
  const [{ data: sub }, { count }] = await Promise.all([
    supabase
      .from("subscription")
      .select("trial_ends_at")
      .eq("company_id", office.company.id)
      .maybeSingle(),
    supabase
      .from("membership")
      .select("id", { count: "exact", head: true })
      .eq("company_id", office.company.id)
      .eq("status", "active")
      .is("deleted_at", null),
  ]);
  return (
    <TrialOffer
      services={companyServices(company.settings)}
      people={Math.max(1, count ?? 1)}
      trialEnds={(sub?.trial_ends_at as string | null) ?? null}
      billing={billingConfigured()}
    />
  );
}
