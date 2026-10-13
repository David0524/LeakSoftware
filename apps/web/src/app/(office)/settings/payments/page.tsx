import type { Metadata } from "next";
import { bpsToPercent } from "@leakbook/core";
import { savePayments } from "@/app/actions/settings";
import { SField, SettingsForm } from "@/components/settings-forms";
import { Card, Notice, PageHeader, SectionTitle, Select } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getPaymentAccount } from "@/lib/data";
import { PaymentsSetupButton } from "@/components/payments-setup";
import { paymentsConfigured, refreshAccount } from "@/server/stripe";

export const metadata: Metadata = { title: "Payments and Deposits · Tidemark" };

interface Settings {
  deposit?: { type?: string; value_bps?: number; value_cents?: number; minimum_cents?: number };
  tax_rate_bps?: number;
  tech_discount_limit_bps?: number;
}

const dollars = (cents: number | undefined) => ((cents ?? 0) / 100).toFixed(2);

export default async function PaymentsSettingsPage({
  searchParams,
}: PageProps<"/settings/payments">) {
  const office = await getOffice();
  const { stripe } = await searchParams;
  let account = office.isOwner ? await getPaymentAccount(office) : null;
  // Back from Stripe onboarding: read the account's state now rather than waiting for the
  // account.updated webhook.
  if (stripe === "return" && account && paymentsConfigured()) {
    await refreshAccount(office.company.id, account.stripe_account_id).catch(() => undefined);
    account = await getPaymentAccount(office);
  }
  const company = await getCompany(office);
  const s = company.settings as Settings;
  const deposit = s.deposit ?? {};

  return (
    <>
      <PageHeader
        title="Payments and Deposits"
        subtitle="How customers pay, and the defaults for new quotes and invoices."
      />
      <Card className="mb-6 max-w-2xl space-y-3">
        <SectionTitle>Online payments</SectionTitle>
        {!paymentsConfigured() ? (
          <Notice tone="warning">
            Online payments aren’t set up on this Tidemark server yet. Customers can still accept
            quotes.
          </Notice>
        ) : account?.charges_enabled ? (
          <>
            <p>
              <strong>Ready.</strong> Customers can pay deposits and invoices by card or bank
              account. Money goes to your Stripe account
              {account.payouts_enabled ? "" : "; finish your Stripe details to receive payouts"}.
            </p>
            <a
              href="https://dashboard.stripe.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center font-semibold text-link underline"
            >
              Open Stripe Dashboard
            </a>
          </>
        ) : (
          <>
            <p>
              Connect a Stripe account so customers can pay deposits and invoices online by card or
              bank account. Your shop is the seller; payments go straight to your account.
            </p>
            {account?.details_submitted ? (
              <p className="text-[15px] text-text-muted">
                Stripe is reviewing your details. This page updates when they finish.
              </p>
            ) : null}
            <PaymentsSetupButton label={account ? "Continue Stripe Setup" : "Set Up Payments"} />
          </>
        )}
      </Card>
      <Card className="max-w-2xl">
        <SettingsForm action={savePayments} primary>
          <Select
            label="Deposit on accepted quotes"
            name="deposit_type"
            defaultValue={deposit.type === "fixed" ? "fixed" : "percent"}
            options={[
              { value: "percent", label: "Percentage of the quote" },
              { value: "fixed", label: "Fixed amount" },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <SField
              label="Deposit percentage"
              name="deposit_percent"
              inputMode="decimal"
              defaultValue={bpsToPercent(deposit.value_bps ?? 5000)}
              hint="Used when the deposit is a percentage."
            />
            <SField
              label="Fixed deposit ($)"
              name="deposit_fixed"
              inputMode="decimal"
              defaultValue={dollars(deposit.value_cents)}
              hint="Used when the deposit is fixed."
            />
            <SField
              label="Minimum deposit ($)"
              name="deposit_minimum"
              inputMode="decimal"
              defaultValue={dollars(deposit.minimum_cents)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SField
              label="Sales tax rate (%)"
              name="tax_rate"
              inputMode="decimal"
              defaultValue={bpsToPercent(s.tax_rate_bps ?? 0)}
              hint="Applied to taxable price book items."
            />
            <SField
              label="Largest discount a tech can give (%)"
              name="tech_discount_limit"
              inputMode="decimal"
              defaultValue={bpsToPercent(s.tech_discount_limit_bps ?? 1000)}
            />
          </div>
        </SettingsForm>
      </Card>
    </>
  );
}
