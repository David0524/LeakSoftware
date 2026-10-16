import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  companyServices,
  onboardingPackage,
  parseOnboardingAnswers,
  type OnboardingAnswers,
} from "@leakbook/core";
import { Onboarding } from "@/components/onboarding";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = { title: "Set Up Your Shop · Tidemark" };

/** New-shop onboarding (owner, 2026-10-16): owners of a new shop come here after sign-up. */
export default function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-label="Loading" />}>
      <WelcomeBody searchParams={searchParams} />
    </Suspense>
  );
}

async function WelcomeBody({
  searchParams,
}: {
  searchParams: PageProps<"/welcome">["searchParams"];
}) {
  const office = await getOffice();
  if (!office.isOwner) redirect("/home");
  const [access, company, { step }] = await Promise.all([
    getAccess(office),
    getCompany(office),
    searchParams,
  ]);
  if (!access || access.onboarded !== false) redirect("/home");
  const { data: sub } = await (
    await createClient()
  )
    .from("subscription")
    .select("onboarding, trial_ends_at")
    .eq("company_id", office.company.id)
    .maybeSingle();
  const services = companyServices(company.settings);
  const pkg = onboardingPackage(services);
  const saved = parseOnboardingAnswers(sub?.onboarding);
  return (
    <Onboarding
      pkg={pkg}
      services={services}
      company={company.name}
      billing={billingConfigured()}
      trialEnds={(sub?.trial_ends_at as string | null) ?? null}
      saved={saved?.package === pkg ? (saved as OnboardingAnswers) : null}
      startAt={step === "card" ? "card" : null}
    />
  );
}
