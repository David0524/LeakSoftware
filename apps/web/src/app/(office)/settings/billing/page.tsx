import type { Metadata } from "next";
import { billingSummary, formatCents } from "@leakbook/core";
import { BillingButton } from "@/components/billing-buttons";
import { Banner } from "@/components/doc-ui";
import { SettingsSection } from "@/components/settings-forms";
import { PageHeader } from "@/components/ui";
import { OWNER_ONLY, getOffice } from "@/lib/auth";
import { getAccess } from "@/lib/data";
import { billingConfigured, currentPrice } from "@/server/billing";
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
                {price ? (
                  <p data-testid="billing-price">
                    {price.name} · {price.people === 1 ? "1 person" : `${price.people} people`} ·{" "}
                    <span className="font-semibold">{formatCents(price.cents)} a month</span>
                    <span className="block text-[0.9375rem] text-text-muted">
                      Adding or turning off a teammate changes the price on your next bill.
                    </span>
                  </p>
                ) : null}
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
                ) : access.subscribed ? (
                  <BillingButton kind="manage" />
                ) : (
                  <>
                    <p className="text-text-muted">
                      Billed monthly by your package and the people on your team. Any days left on
                      your free trial carry over: you’re charged when the trial ends.
                    </p>
                    <BillingButton kind="subscribe" publishableKey={stripePublishableKey()} />
                  </>
                )}
              </>
            )}
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
