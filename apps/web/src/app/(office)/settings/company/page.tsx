import type { Metadata } from "next";
import { AddressField } from "@/components/address-field";
import {
  saveBranding,
  saveCompany,
  saveFollowups,
  saveNextJobNumber,
  saveReportText,
} from "@/app/actions/settings";
import {
  BrandingFields,
  SField,
  SSelect,
  STextArea,
  SSwitch,
  SettingsFields,
  SettingsForm,
  SettingsSection,
} from "@/components/settings-forms";
import { ServicesForm } from "@/components/services-form";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { companyServices, offersLeak } from "@leakbook/core";

export const metadata: Metadata = { title: "Company Settings · Sundeck Pro" };

const US_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export default async function CompanySettingsPage() {
  const office = await getOffice();
  const company = await getCompany(office);
  const str = (k: string) => (company[k] as string | null) ?? "";
  let logoUrl: string | null = null;
  if (company.logo_path) {
    const supabase = await createClient();
    const { data } = await supabase.storage
      .from("company-assets")
      .createSignedUrl(company.logo_path, 3600);
    logoUrl = data?.signedUrl ?? null;
  }
  const { data: lastJob } = await (
    await createClient()
  )
    .from("job")
    .select("number")
    .eq("company_id", office.company.id)
    .not("number", "is", null)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastNumber = (lastJob?.number as number | undefined) ?? 0;
  const settings = company.settings as {
    reminders?: { quote_days?: number[]; invoice_days?: number[] };
    review_requests?: boolean;
  };
  const zones = US_ZONES.includes(company.timezone) ? US_ZONES : [company.timezone, ...US_ZONES];

  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Company and Branding"
        subtitle="Shown on reports, quotes, and invoices."
      />
      <div className="max-w-2xl space-y-6">
        <SettingsSection title="Services">
          <ServicesForm services={companyServices(company.settings)} />
        </SettingsSection>

        <SettingsSection title="Company profile">
          <SettingsForm action={saveCompany} full>
            <SettingsFields labelWidth="7.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
              <SField label="Company name" name="name" defaultValue={company.name} required />
              <SField
                label="Legal name"
                name="legal_name"
                defaultValue={str("legal_name")}
                hint="If different, for invoices."
              />
              <SField label="Phone" name="phone" type="tel" defaultValue={str("phone")} />
              <SField label="Email" name="email" type="email" defaultValue={str("email")} />
              <AddressField
                label="Street address"
                name="address_line1"
                defaultValue={str("address_line1")}
              />
              <SField
                label="Address line 2"
                name="address_line2"
                defaultValue={str("address_line2")}
              />
              <SField label="City" name="city" defaultValue={str("city")} />
              <SField label="State" name="state" maxLength={2} defaultValue={str("state")} />
              <SField label="ZIP" name="postal_code" defaultValue={str("postal_code")} />
              <SSelect
                label="Time zone"
                name="timezone"
                defaultValue={company.timezone}
                options={zones.map((z) => ({ value: z, label: z.replace("_", " ") }))}
              />
              <SField
                label="Review link"
                name="review_url"
                type="url"
                defaultValue={str("review_url")}
                hint="Your Google or Yelp page. Review requests link here."
                className="sm:col-span-2"
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>

        <SettingsSection title="Reminders and Reviews">
          <SettingsForm action={saveFollowups} full>
            <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
              Emails sent once a day, in the morning. They stop when a quote is accepted or an
              invoice is paid, and customers can turn them off from any of them.
            </p>
            <SettingsFields className="sm:grid sm:grid-cols-2 sm:gap-4">
              <SField
                label="Quote reminders (days after sending)"
                name="quote_days"
                defaultValue={(settings.reminders?.quote_days ?? [3, 7]).join(", ")}
                hint="For quotes not yet accepted. Leave empty for none."
                stacked
              />
              <SField
                label="Invoice reminders (days after sending)"
                name="invoice_days"
                defaultValue={(settings.reminders?.invoice_days ?? [7, 14, 30]).join(", ")}
                hint="For invoices not yet paid in full. Leave empty for none."
                stacked
              />
            </SettingsFields>
            <SettingsFields>
              <SSwitch
                name="review_requests"
                label="Ask for a review after a job is paid"
                defaultChecked={settings.review_requests ?? true}
                hint={
                  company.review_url
                    ? undefined
                    : "Add your review link under Company profile to send review requests."
                }
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>

        {offersLeak(company.settings) ? (
          <SettingsSection title="Report terms">
            <SettingsForm action={saveReportText} full>
              <SettingsFields>
                <STextArea
                  label="Disclaimer"
                  name="report_disclaimer"
                  rows={8}
                  defaultValue={str("report_disclaimer")}
                  hint="Printed at the end of every report, as written. Reports already sent keep the text they were sent with."
                />
              </SettingsFields>
            </SettingsForm>
          </SettingsSection>
        ) : null}

        <SettingsSection title="Job numbers">
          <SettingsForm action={saveNextJobNumber} full>
            <SettingsFields labelWidth="9.5rem">
              <SField
                label="Next job number"
                name="next_job_number"
                type="number"
                inputMode="numeric"
                min={lastNumber + 1}
                defaultValue={String(lastNumber + 1)}
                hint={
                  lastNumber
                    ? `The last job is #${lastNumber}. To continue from your old system, enter a higher number.`
                    : "To continue from your old system, enter your next number."
                }
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>

        <SettingsSection title="Branding">
          <SettingsForm action={saveBranding} full>
            <SettingsFields className="sm:space-y-6">
              <BrandingFields
                logoUrl={logoUrl}
                companyName={company.name}
                primary={company.brand_primary}
                secondary={company.brand_secondary}
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>
      </div>
    </>
  );
}
