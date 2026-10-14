import { Grouped, PageHeader, Row } from "@/components/ui";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

/**
 * Settings, as iOS lays it out: the sections in grouped lists, each row opening its page.
 * Wider screens also have them in the sidebar.
 */
export default function SettingsIndex() {
  const groups = [
    { title: "Your shop", hrefs: ["/settings/company", "/settings/team", "/settings/scheduling"] },
    {
      title: "Money",
      hrefs: ["/settings/price-book", "/settings/payments", "/settings/billing"],
    },
    {
      title: "Checklists and reports",
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
    "/settings/scheduling": "Working day, shop location, and drive times",
    "/settings/price-book": "Repair items for quotes",
    "/settings/payments": "How customers pay, and deposits",
    "/settings/billing": "Your shop’s Tidemark subscription",
    "/settings/components": "What every inspection checks",
    "/settings/tests": "Tests techs record on the phone",
    "/settings/severities": "How serious a finding is",
    "/settings/exclusions": "Why a component wasn’t inspected",
    "/settings/reports": "Wording and tone of written reports",
  };
  // A section not placed in a group above still shows, at the end.
  const placed = groups.flatMap((g) => g.hrefs);
  const rest = SETTINGS_SECTIONS.filter((s) => !placed.includes(s.href)).map((s) => s.href);
  if (rest.length) groups.at(-1)!.hrefs.push(...rest);
  return (
    <>
      <PageHeader title="Settings" back={{ href: "/more", label: "More" }} />
      <div className="max-w-xl space-y-6">
        {groups.map((g) => (
          <Grouped key={g.title} title={g.title}>
            {SETTINGS_SECTIONS.filter((s) => g.hrefs.includes(s.href)).map((s) => (
              <Row key={s.href} href={s.href} label={s.label} detail={detail[s.href]} />
            ))}
          </Grouped>
        ))}
      </div>
    </>
  );
}
