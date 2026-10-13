import type { Metadata } from "next";
import { billingSummary } from "@leakbook/core";
import { BillingButton } from "@/components/billing-buttons";
import { Card, Notice, PageHeader, SectionTitle } from "@/components/ui";
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
        title="Tidemark Billing"
        subtitle="Your shop’s subscription to Tidemark. Separate from the payments your customers make to you."
      />
      <Card className="max-w-2xl space-y-4">
        <SectionTitle>Subscription</SectionTitle>
        {subscribed ? (
          <Notice tone="success">
            Thank you. Your subscription is being set up; this page updates in a moment.
          </Notice>
        ) : null}
        {!access ? (
          <p>Billing isn’t available until the database is updated.</p>
        ) : (
          <>
            <p className="text-xl font-semibold">{billingSummary(access)}</p>
            {access.locked ? (
              <Notice tone="error">
                Your team can still see every job, report, photo, and invoice, but can’t change
                anything until the subscription is paid. Nothing has been deleted.
              </Notice>
            ) : null}
            {access.plan === "demo" ? null : !billingConfigured() ? (
              <Notice tone="warning">
                Subscriptions aren’t set up on this Tidemark server yet.
              </Notice>
            ) : access.subscribed ? (
              <BillingButton kind="manage" />
            ) : (
              <>
                <p className="text-text-muted">
                  One price per shop, billed monthly. Any days left on your free trial carry over:
                  you’re charged when the trial ends.
                </p>
                <BillingButton kind="subscribe" />
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}
