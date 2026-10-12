import type { Metadata } from "next";
import { bpsToPercent } from "@leakbook/core";
import { savePayments } from "@/app/actions/settings";
import { SField, SettingsForm } from "@/components/settings-forms";
import { Card, PageHeader, Select } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";

export const metadata: Metadata = { title: "Deposits and Tax · LeakBook" };

interface Settings {
  deposit?: { type?: string; value_bps?: number; value_cents?: number; minimum_cents?: number };
  tax_rate_bps?: number;
  tech_discount_limit_bps?: number;
}

const dollars = (cents: number | undefined) => ((cents ?? 0) / 100).toFixed(2);

export default async function PaymentsSettingsPage() {
  const office = await getOffice();
  const company = await getCompany(office);
  const s = company.settings as Settings;
  const deposit = s.deposit ?? {};

  return (
    <>
      <PageHeader
        title="Deposits and Tax"
        subtitle="Defaults for new quotes and invoices. Techs can adjust a quote within these limits."
      />
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
