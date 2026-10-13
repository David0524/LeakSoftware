import type { Metadata } from "next";
import {
  saveBranding,
  saveCompany,
  saveNextJobNumber,
  saveReportText,
} from "@/app/actions/settings";
import { ColorField, FieldError, SField, SettingsForm } from "@/components/settings-forms";
import { Card, PageHeader, Select, TextArea } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Company Settings · Tidemark" };

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
  const zones = US_ZONES.includes(company.timezone) ? US_ZONES : [company.timezone, ...US_ZONES];

  return (
    <>
      <PageHeader title="Company and Branding" subtitle="Shown on reports, quotes, and invoices." />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Company profile</h2>
          <SettingsForm action={saveCompany}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SField label="Company name" name="name" defaultValue={company.name} required />
              <SField
                label="Legal name"
                name="legal_name"
                defaultValue={str("legal_name")}
                hint="If different, for invoices."
              />
              <SField label="Phone" name="phone" type="tel" defaultValue={str("phone")} />
              <SField label="Email" name="email" type="email" defaultValue={str("email")} />
              <SField
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
              <div className="grid grid-cols-2 gap-4">
                <SField label="State" name="state" maxLength={2} defaultValue={str("state")} />
                <SField label="ZIP" name="postal_code" defaultValue={str("postal_code")} />
              </div>
              <Select
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
                hint="Your Google or Yelp page. Used for review requests later."
              />
            </div>
          </SettingsForm>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Report terms</h2>
          <SettingsForm action={saveReportText}>
            <TextArea
              label="Disclaimer"
              name="report_disclaimer"
              rows={8}
              defaultValue={str("report_disclaimer")}
              hint="Printed at the end of every report, as written. Reports already sent keep the text they were sent with."
            />
            <FieldError name="report_disclaimer" />
          </SettingsForm>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Job numbers</h2>
          <SettingsForm action={saveNextJobNumber}>
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
          </SettingsForm>
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Branding</h2>
          <SettingsForm action={saveBranding}>
            <div className="space-y-2">
              <label htmlFor="logo" className="block font-medium">
                Logo
              </label>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                <img
                  src={logoUrl}
                  alt={`${company.name} logo`}
                  className="max-h-20 rounded-md border border-border bg-paper p-2"
                />
              ) : (
                <p className="text-text-muted">
                  No logo yet. Reports show your company name instead.
                </p>
              )}
              <input
                id="logo"
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="block w-full min-h-11 file:mr-3 file:min-h-11 file:rounded-md file:border-2 file:border-text file:text-text file:bg-surface file:px-4 file:font-display file:font-bold"
              />
              <p className="text-[15px] text-text-muted">
                PNG, JPEG, or SVG, under 2 MB. A wide logo works best.
              </p>
              <FieldError name="logo" />
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <ColorField
                name="brand_primary"
                label="Main color"
                defaultValue={company.brand_primary}
              />
              <ColorField
                name="brand_secondary"
                label="Accent color"
                defaultValue={company.brand_secondary}
                optional
              />
            </div>
          </SettingsForm>
        </Card>
      </div>
    </>
  );
}
