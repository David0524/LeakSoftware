import { offersLeak, offersPool } from "@leakbook/core";
import { PageHeader } from "@/components/ui";
import { SettingsSearchList } from "@/components/settings-search";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { settingsGroups } from "@/lib/settings-sections";

/**
 * Settings, as iOS lays it out: the sections in grouped lists, each row opening its page.
 * Wider screens also have them in the sidebar.
 */
export default async function SettingsIndex() {
  const company = await getCompany(await getOffice());
  const groups = settingsGroups(company.settings);
  // What each section holds, in a line (from its page's own subtitle).
  const detail: Record<string, string> = {
    "/settings/company": "Shown on reports, quotes, and invoices",
    "/settings/team": "Techs, owners, and invites",
    "/settings/import": "From a spreadsheet or your old software",
    "/settings/scheduling": "Working day, shop location, and drive times",
    "/settings/phone": "The company number for texts and calls",
    "/settings/price-book": offersPool(company.settings)
      ? "Services, chemicals, and repairs for quotes"
      : "Detection fees and repairs for quotes",
    "/settings/payments": "How customers pay, and deposits",
    "/settings/billing": "Your shop’s Sundeck Pro subscription",
    "/settings/components": offersLeak(company.settings)
      ? "What every inspection checks"
      : "What every visit checks",
    "/settings/tests": "Tests techs record on the phone",
    "/settings/severities": "How serious a finding is",
    "/settings/exclusions": "Why a component wasn’t inspected",
    "/settings/skip-reasons": "Why a visit was skipped",
    "/settings/reports": "Which reports techs can send",
  };
  return (
    <>
      <PageHeader title="Settings" back={{ href: "/more", label: "More" }} />
      <div className="max-w-xl">
        <SettingsSearchList
          groups={groups.map((g) => ({
            title: g.title,
            sections: g.sections.map((s) => ({ ...s, detail: detail[s.href] })),
          }))}
        />
      </div>
    </>
  );
}
