import { offersLeak, offersPool } from "@leakbook/core";
import { Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { settingsSections } from "@/lib/settings-sections";

/**
 * Settings, as iOS lays it out: the sections in grouped lists, each row opening its page.
 * Wider screens also have them in the sidebar.
 */
export default async function SettingsIndex() {
  const company = await getCompany(await getOffice());
  const sections = settingsSections(company.settings);
  const groups = [
    {
      title: "Your shop",
      hrefs: [
        "/settings/company",
        "/settings/team",
        "/settings/import",
        "/settings/scheduling",
        "/settings/phone",
      ],
    },
    {
      title: "Money",
      hrefs: ["/settings/price-book", "/settings/payments", "/settings/billing"],
    },
    {
      title: offersLeak(company.settings) ? "Checklists and reports" : "Checklists",
      hrefs: [
        "/settings/components",
        "/settings/tests",
        "/settings/severities",
        "/settings/exclusions",
        "/settings/reports",
      ],
    },
  ];
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
    "/settings/billing": "Your shop’s Tidemark subscription",
    "/settings/components": offersLeak(company.settings)
      ? "What every inspection checks"
      : "What every visit checks",
    "/settings/tests": "Tests techs record on the phone",
    "/settings/severities": "How serious a finding is",
    "/settings/exclusions": "Why a component wasn’t inspected",
    "/settings/reports": "Wording and tone of written reports",
  };
  // A section not placed in a group above still shows, at the end.
  const placed = groups.flatMap((g) => g.hrefs);
  const rest = sections.filter((s) => !placed.includes(s.href)).map((s) => s.href);
  if (rest.length) groups.at(-1)!.hrefs.push(...rest);
  return (
    <>
      <PageHeader title="Settings" back={{ href: "/more", label: "More" }} />
      <div className="max-w-xl space-y-6">
        {groups.map((g) => (
          <Grouped key={g.title} title={g.title}>
            {sections
              .filter((s) => g.hrefs.includes(s.href))
              .map((s) => (
                <Row key={s.href} href={s.href} label={s.label} detail={detail[s.href]} />
              ))}
          </Grouped>
        ))}
      </div>
    </>
  );
}
