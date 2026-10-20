import { offersLeak } from "@leakbook/core";

/** Settings pages, in the order shown in the settings sidebar. */
const SETTINGS_SECTIONS = [
  { href: "/settings/company", label: "Company and Branding" },
  { href: "/settings/team", label: "Team" },
  { href: "/settings/import", label: "Import Customers" },
  { href: "/settings/scheduling", label: "Scheduling and Routes" },
  { href: "/settings/phone", label: "Phone and Texting" },
  { href: "/settings/price-book", label: "Price Book" },
  { href: "/settings/payments", label: "Payments and Deposits" },
  { href: "/settings/billing", label: "Sundeck Pro Billing" },
  { href: "/settings/components", label: "Checklist Components" },
  { href: "/settings/tests", label: "Test Types" },
  { href: "/settings/severities", label: "Severities" },
  { href: "/settings/exclusions", label: "Exclusion Reasons" },
  { href: "/settings/reports", label: "Report Templates" },
];

/**
 * Leak detection's settings: hidden for pool care shops (company services setting). Report
 * Templates stays: pool shops set their visit reports there (2026-10-20).
 */
const LEAK_ONLY = ["/settings/tests", "/settings/severities", "/settings/exclusions"];

/** The settings pages this shop uses. */
export function settingsSections(settings: unknown) {
  return offersLeak(settings)
    ? SETTINGS_SECTIONS
    : SETTINGS_SECTIONS.filter((s) => !LEAK_ONLY.includes(s.href));
}

/**
 * The settings pages in their groups, as the Settings list and the desktop sidebar show them.
 * A page not placed in a group still shows, at the end.
 */
export function settingsGroups(settings: unknown) {
  const sections = settingsSections(settings);
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
  const placed = groups.flatMap((g) => g.hrefs);
  const rest = sections.filter((s) => !placed.includes(s.href)).map((s) => s.href);
  if (rest.length) groups.at(-1)!.hrefs.push(...rest);
  return groups.map((g) => ({
    title: g.title,
    sections: sections.filter((s) => g.hrefs.includes(s.href)),
  }));
}
