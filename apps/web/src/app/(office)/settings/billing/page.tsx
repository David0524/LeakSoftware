import type { Metadata } from "next";
import { billingSummary } from "@leakbook/core";
import { BillingButton, BillingPlan } from "@/components/billing-buttons";
import { AppliedCode, HaveCode } from "@/components/code-field";
import { ReferralCard } from "@/components/referral-card";
import { Banner } from "@/components/doc-ui";
import { SettingsSection } from "@/components/settings-forms";
import { PageHeader } from "@/components/ui";
import { OWNER_ONLY, getOffice } from "@/lib/auth";
import { getAccess } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import { appliedCode, billingConfigured, currentPrice } from "@/server/billing";
import { stripePublishableKey } from "@/server/stripe";

export const metadata: Metadata = { title: "Sundeck Pro Billing · Sundeck Pro" };

/** The shop's own Sundeck Pro subscription (owners). */
export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const office = await getOffice();
  const [access, { subscribed }] = await Promise.all([getAccess(office), searchParams]);
  // The price follows the package and the active people; opening this page also brings
  // Stripe in line (owner, 2026-10-18).
  const price =
    access && access.plan !== "demo" && billingConfigured() && office.isOwner
      ? await currentPrice(office.company.id)
      : null;
  // The code the shop used, and its own referral code (owner, 2026-11-23). Owners only.
  const supabase = await createClient();
  const [code, referral] =
    office.isOwner && access && access.plan !== "demo"
      ? await Promise.all([
          appliedCode(office.company.id, adminClient() ?? supabase),
          supabase
            .rpc("referral_summary", { target_company: office.company.id })
            .then(
              ({ data }) => data as { code: string | null; used: number; earned: number } | null,
            ),
        ])
      : [null, null];
  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Sundeck Pro Billing"
        subtitle="Your own subscription, not what customers pay you."
      />
      <div className="max-w-2xl">
        <SettingsSection title="Subscription" boxed>
          <div className="space-y-4">
            {subscribed ? (
              <Banner tone="success">
                Thank you. Your subscription is being set up; this page updates in a moment.
              </Banner>
            ) : null}
            {!office.isOwner ? (
              // Sundeck Pro billing is the owner's (owner, 2026-10-18).
              <>
                {access ? <p className="text-xl font-semibold">{billingSummary(access)}</p> : null}
                <Banner tone="info">{OWNER_ONLY}</Banner>
              </>
            ) : !access ? (
              <p>Billing isn’t available until the database is updated.</p>
            ) : (
              <>
                <p className="text-xl font-semibold">{billingSummary(access)}</p>
                {price?.problem ? <Banner tone="warning">{price.problem}</Banner> : null}
                {access.locked ? (
                  <Banner tone="error">
                    Your team can still see every job, report, photo, and invoice, but can’t change
                    anything until the subscription is paid. Nothing has been deleted.
                  </Banner>
                ) : null}
                {access.plan === "demo" ? null : !billingConfigured() ? (
                  <Banner tone="warning">
                    Subscriptions aren’t set up on this Sundeck Pro server yet.
                  </Banner>
                ) : price ? (
                  <BillingPlan
                    name={price.name}
                    services={price.services}
                    billed={price.people}
                    active={price.active}
                    subscribed={access.subscribed}
                    publishableKey={stripePublishableKey()}
                    offer={code?.offer}
                  />
                ) : access.subscribed ? (
                  <BillingButton kind="manage" />
                ) : (
                  <BillingButton kind="subscribe" publishableKey={stripePublishableKey()} />
                )}
                {code?.offer ? <AppliedCode offer={code.offer} /> : null}
                {code?.canEnter ? <HaveCode from="billing" /> : null}
              </>
            )}
          </div>
        </SettingsSection>
        {referral?.code ? (
          <div className="mt-8">
            <SettingsSection title="Give a Month, Get a Month" boxed>
              <ReferralCard
                code={referral.code}
                used={Number(referral.used) || 0}
                earned={Number(referral.earned) || 0}
                origin={await siteOrigin()}
              />
            </SettingsSection>
          </div>
        ) : null}
      </div>
    </>
  );
}
