import type { Metadata } from "next";
import { AddressField } from "@/components/address-field";
import { saveCompanySettings } from "@/app/actions/settings";
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
import { ReminderChannelChoice } from "@/components/reminder-channel";
import { ServicesChoice } from "@/components/services-form";
import { SecondBusinessWork } from "@/components/second-business-form";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import {
  FEEDBACK_WORDS,
  SECOND_BUSINESS_TEXT,
  askFeedbackFirst,
  secondBusinessWork,
  type BusinessCompany,
  companyServices,
  offersLeak,
  reminderChannel,
} from "@leakbook/core";

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
  const sign = async (path: unknown) => {
    if (typeof path !== "string" || !path) return null;
    const { data } = await (
      await createClient()
    ).storage
      .from("company-assets")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };
  const [logoUrl, secondLogoUrl] = await Promise.all([
    sign(company.logo_path),
    sign(company.second_logo_path),
  ]);
  // Shown once the database has the second business (migration 20261022006200).
  const both = companyServices(company.settings) === "both" && "second_for" in company;
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
  const channel = reminderChannel(company.settings);
  const zones = US_ZONES.includes(company.timezone) ? US_ZONES : [company.timezone, ...US_ZONES];

  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Company and Branding" />
      {/* One form and one Save for the whole page (owner, 2026-10-22: "remove all the save
          buttons on that page and just have one floating one on the bottom"). */}
      <SettingsForm action={saveCompanySettings} floating className="max-w-2xl space-y-6">
        <SettingsSection title="Services">
          <div className="px-4 sm:px-0">
            <ServicesChoice initial={companyServices(company.settings)} />
          </div>
        </SettingsSection>

        <SettingsSection title="Company profile">
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
              hint="Your Google or Yelp page."
              className="sm:col-span-2"
            />
          </SettingsFields>
        </SettingsSection>

        <SettingsSection title="Reminders and Reviews">
          <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
            Sent once a day, in the morning. They stop when a quote is accepted or an invoice is
            paid, and customers can turn them off from any of them.
          </p>
          <ReminderChannelChoice initial={channel} />
          <SettingsFields className="sm:grid sm:grid-cols-2 sm:gap-4">
            <SField
              label="Quote reminders (days after sending)"
              name="quote_days"
              defaultValue={(settings.reminders?.quote_days ?? [3, 7]).join(", ")}
              hint="Leave empty for none."
              stacked
            />
            <SField
              label="Invoice reminders (days after sending)"
              name="invoice_days"
              defaultValue={(settings.reminders?.invoice_days ?? [7, 14, 30]).join(", ")}
              hint="Leave empty for none."
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
            <SSwitch
              name="ask_feedback_first"
              label={FEEDBACK_WORDS.settingTitle}
              defaultChecked={askFeedbackFirst(company.settings)}
              hint={FEEDBACK_WORDS.settingHint}
            />
          </SettingsFields>
        </SettingsSection>

        {offersLeak(company.settings) ? (
          <SettingsSection title="Report terms">
            <SettingsFields>
              <STextArea
                label="Disclaimer"
                name="report_disclaimer"
                rows={8}
                defaultValue={str("report_disclaimer")}
                hint="Ends every report. Reports already sent keep their old text."
              />
            </SettingsFields>
          </SettingsSection>
        ) : null}

        <SettingsSection title="Job numbers">
          {/* What it was, so an unchanged number isn't sent again (numbers only go up). */}
          <input type="hidden" name="next_job_number_was" value={String(lastNumber + 1)} />
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
        </SettingsSection>

        <SettingsSection title="Branding">
          <SettingsFields className="sm:space-y-6">
            <BrandingFields
              logoUrl={logoUrl}
              companyName={company.name}
              primary={company.brand_primary}
              secondary={company.brand_secondary}
            />
          </SettingsFields>
        </SettingsSection>

        {/* A second business name for one line of work (2026-11-26), for shops doing both. */}
        {both ? (
          <SettingsSection title={SECOND_BUSINESS_TEXT.header}>
            <SettingsFields labelWidth="8.5rem" className="sm:grid sm:grid-cols-2 sm:gap-4">
              <SField
                label={SECOND_BUSINESS_TEXT.name}
                name="second_name"
                defaultValue={str("second_name")}
                className="sm:col-span-2"
              />
              <SField
                label={SECOND_BUSINESS_TEXT.phone}
                name="second_phone"
                type="tel"
                defaultValue={str("second_phone")}
              />
              <SField
                label={SECOND_BUSINESS_TEXT.email}
                name="second_email"
                type="email"
                defaultValue={str("second_email")}
              />
              <SField
                label={SECOND_BUSINESS_TEXT.reviewUrl}
                name="second_review_url"
                type="url"
                defaultValue={str("second_review_url")}
                className="sm:col-span-2"
              />
            </SettingsFields>
            <div className="mt-4 px-4 sm:px-0">
              <SecondBusinessWork initial={secondBusinessWork(company as BusinessCompany)} />
            </div>
            <SettingsFields className="mt-4 sm:space-y-6">
              <BrandingFields
                prefix="second_"
                accent={false}
                removable
                logoUrl={secondLogoUrl}
                logoPath={str("second_logo_path") || null}
                companyName={str("second_name") || company.name}
                primary={str("second_brand_primary") || company.brand_primary}
                secondary={null}
              />
            </SettingsFields>
            <p className="mt-3 px-4 text-[0.9375rem] text-text-muted sm:px-0">
              {SECOND_BUSINESS_TEXT.footer}
            </p>
          </SettingsSection>
        ) : null}
      </SettingsForm>
    </>
  );
}
