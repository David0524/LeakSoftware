import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { chosenTeamSize, companyServices, mustFinishSetup } from "@leakbook/core";
import { TrialOffer } from "@/components/trial-offer";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import {
  appliedCode,
  billingConfigured,
  finishOnboarding,
  publishedPrices,
  shopBillingPrice,
} from "@/server/billing";
import { applySignUpCode } from "@/server/sign-up-code";
import { stripePublishableKey } from "@/server/stripe";

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
  // The code from a sign-up link (owner, 2026-11-23), applied to the shop its owner made, once,
  // before the offer is read, so the page already shows it. A refusal (say the code was turned
  // off since) waits in the code field, with the field's own message.
  const signUpCode = await applySignUpCode(supabase, office.company.id);
  if (signUpCode.kind === "demo") {
    const admin = adminClient();
    if (admin) await finishOnboarding(admin, office.company.id);
    redirect("/welcome/done");
  }
  const server = adminClient();
  const [{ data: sub }, { count }, code, pricing] = await Promise.all([
    supabase
      .from("subscription")
      .select("trial_ends_at, heard_from")
      .eq("company_id", office.company.id)
      .maybeSingle(),
    supabase
      .from("membership")
      .select("id", { count: "exact", head: true })
      .eq("company_id", office.company.id)
      .eq("status", "active")
      .is("deleted_at", null),
    // The code used, if any (owner, 2026-11-23); the owner's own client reads it without the
    // server key, just not the referring shop's name.
    appliedCode(office.company.id, adminClient() ?? supabase),
    // What the shop will pay: the newest prices, or staff's own price for it (owner, 2026-11-24).
    server
      ? shopBillingPrice(server, office.company.id)
      : publishedPrices().then((prices) => ({ prices, override: null, today: "" })),
  ]);
  const people = Math.max(1, count ?? 1);
  return (
    <TrialOffer
      services={companyServices(company.settings)}
      people={people}
      teamSize={chosenTeamSize(company.settings) ?? people}
      trialEnds={(sub?.trial_ends_at as string | null) ?? null}
      heardFrom={(sub?.heard_from as string | null) ?? null}
      billing={billingConfigured()}
      publishableKey={stripePublishableKey()}
      offer={code.offer}
      pricing={pricing}
      canEnterCode={code.canEnter}
      refusedCode={
        signUpCode.kind === "refused" ? { code: signUpCode.code, error: signUpCode.error } : null
      }
    />
  );
}
