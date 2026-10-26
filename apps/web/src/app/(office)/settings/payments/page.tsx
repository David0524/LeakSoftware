import type { Metadata } from "next";
import { CARD_FEE_MAX_BPS, bpsToPercent, cardFeeBps } from "@leakbook/core";
import { saveCardFee, savePayments } from "@/app/actions/settings";
import { Banner } from "@/components/doc-ui";
import {
  SField,
  SSelect,
  SSwitch,
  SettingsFields,
  SettingsForm,
  SettingsSection,
} from "@/components/settings-forms";
import { PageHeader } from "@/components/ui";
import { OWNER_ONLY, getOffice } from "@/lib/auth";
import { getCompany, getPaymentAccount } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { PaymentsSetupButton } from "@/components/payments-setup";
import { paymentsConfigured, refreshAccount } from "@/server/stripe";

export const metadata: Metadata = { title: "Payments and Deposits · Sundeck Pro" };

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
  let account = office.isManager ? await getPaymentAccount(office) : null;
  // Back from Stripe onboarding: read the account's state now rather than waiting for the
  // account.updated webhook.
  if (stripe === "return" && account && paymentsConfigured()) {
    await refreshAccount(office.company.id, account.stripe_account_id, await siteOrigin()).catch(
      () => undefined,
    );
    account = await getPaymentAccount(office);
  }
  const company = await getCompany(office);
  const s = company.settings as Settings;
  const deposit = s.deposit ?? {};
  // One filled button per page: while Stripe setup is pending, that is the main action.
  const setupPending = paymentsConfigured() && !account?.charges_enabled && office.isOwner;

  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Payments and Deposits" />
      <div className="max-w-2xl space-y-6">
        <SettingsSection title="Online payments" boxed>
          <div className="space-y-3">
            {!paymentsConfigured() ? (
              <Banner tone="warning">
                Online payments aren’t set up on this Sundeck Pro server yet. Customers can still
                accept quotes.
              </Banner>
            ) : account?.charges_enabled ? (
              <>
                <p>
                  <strong>Ready.</strong> Customers can pay deposits and invoices by card or bank
                  account. Money goes to your Stripe account
                  {account.payouts_enabled ? "" : "; finish your Stripe details to receive payouts"}
                  .
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
                  Connect a Stripe account so customers can pay deposits and invoices online by card
                  or bank account. Your shop is the seller; payments go straight to your account.
                </p>
                {account?.details_submitted ? (
                  <p className="text-[0.9375rem] text-text-muted">
                    Stripe is reviewing your details. This page updates when they finish.
                  </p>
                ) : null}
                {/* Connecting or changing the shop's Stripe account: owners only. */}
                {office.isOwner ? (
                  <PaymentsSetupButton
                    label={account ? "Continue Stripe Setup" : "Set Up Payments"}
                  />
                ) : (
                  <Banner tone="info">{OWNER_ONLY}</Banner>
                )}
              </>
            )}
          </div>
        </SettingsSection>
        <SettingsSection title="Card fee">
          {office.isOwner ? (
            <SettingsForm action={saveCardFee} full>
              <SSwitch
                label="Pass the card fee to customers"
                name="card_fee_on"
                defaultChecked={cardFeeBps(company.settings) > 0}
                hint="Customers pick card or bank. Only card adds the fee."
              />
              <SettingsFields labelWidth="10rem">
                <SField
                  label="Card fee (%)"
                  name="card_fee"
                  inputMode="decimal"
                  defaultValue={bpsToPercent(cardFeeBps(company.settings) || CARD_FEE_MAX_BPS)}
                  hint="Up to 3%. Some states don’t allow card fees; check yours before turning this on."
                />
              </SettingsFields>
            </SettingsForm>
          ) : (
            <div className="space-y-2 px-4 sm:px-0">
              <p>
                {cardFeeBps(company.settings)
                  ? `Customers who pay by card pay a ${bpsToPercent(cardFeeBps(company.settings))}% card fee.`
                  : "Customers pay no card fee."}
              </p>
              <Banner tone="info">{OWNER_ONLY}</Banner>
            </div>
          )}
        </SettingsSection>

        <SettingsSection title="Deposits, tax, and discounts">
          <SettingsForm action={savePayments} primary={!setupPending} full>
            <SettingsFields labelWidth="10rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
              <SSelect
                label="Deposit on accepted quotes"
                name="deposit_type"
                defaultValue={deposit.type === "fixed" ? "fixed" : "percent"}
                options={[
                  { value: "percent", label: "Percentage of the quote" },
                  { value: "fixed", label: "Fixed amount" },
                ]}
                className="sm:col-span-2"
              />
            </SettingsFields>
            <SettingsFields labelWidth="10rem" className="sm:grid sm:grid-cols-3 sm:gap-4">
              <SField
                label="Deposit percentage"
                name="deposit_percent"
                inputMode="decimal"
                defaultValue={bpsToPercent(deposit.value_bps ?? 0)}
              />
              <SField
                label="Fixed deposit ($)"
                name="deposit_fixed"
                inputMode="decimal"
                defaultValue={dollars(deposit.value_cents)}
              />
              <SField
                label="Minimum deposit ($)"
                name="deposit_minimum"
                inputMode="decimal"
                defaultValue={dollars(deposit.minimum_cents)}
              />
            </SettingsFields>
            <SettingsFields labelWidth="10rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
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
                defaultValue={bpsToPercent(s.tech_discount_limit_bps ?? 0)}
                stacked
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>
      </div>
    </>
  );
}
