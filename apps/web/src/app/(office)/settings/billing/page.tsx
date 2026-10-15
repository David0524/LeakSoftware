import type { Metadata } from "next";
import { billingSummary } from "@leakbook/core";
import { BillingButton } from "@/components/billing-buttons";
import { Banner } from "@/components/doc-ui";
import { SettingsSection } from "@/components/settings-forms";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getAccess } from "@/lib/data";
import { billingConfigured } from "@/server/billing";

export const metadata: Metadata = { title: "Tidemark Billing · Tidemark" };

/** The shop's own Tidemark subscription (owners). */
export default async function BillingPage({ searchParams }: PageProps<"/settings/billing">) {
  const office = await getOffice();
  const [access, { subscribed }] = await Promise.all([getAccess(office), searchParams]);
  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Tidemark Billing"
        subtitle="Your shop’s subscription to Tidemark. Separate from the payments your customers make to you."
      />
      <div className="max-w-2xl">
        <SettingsSection title="Subscription" boxed>
          <div className="space-y-4">
            {subscribed ? (
              <Banner tone="success">
                Thank you. Your subscription is being set up; this page updates in a moment.
              </Banner>
            ) : null}
            {!access ? (
              <p>Billing isn’t available until the database is updated.</p>
            ) : (
              <>
                <p className="text-xl font-semibold">{billingSummary(access)}</p>
                {access.locked ? (
                  <Banner tone="error">
                    Your team can still see every job, report, photo, and invoice, but can’t change
                    anything until the subscription is paid. Nothing has been deleted.
                  </Banner>
                ) : null}
                {access.plan === "demo" ? null : !billingConfigured() ? (
                  <Banner tone="warning">
                    Subscriptions aren’t set up on this Tidemark server yet.
                  </Banner>
                ) : access.subscribed ? (
                  <BillingButton kind="manage" />
                ) : (
                  <>
                    <p className="text-text-muted">
                      One price per shop, billed monthly. Any days left on your free trial carry
                      over: you’re charged when the trial ends.
                    </p>
                    <BillingButton kind="subscribe" />
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
