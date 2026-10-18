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

/** Leak detection's settings: hidden for pool care shops (company services setting). */
const LEAK_ONLY = [
  "/settings/tests",
  "/settings/severities",
  "/settings/exclusions",
  "/settings/reports",
];

/** The settings pages this shop uses. */
export function settingsSections(settings: unknown) {
  return offersLeak(settings)
    ? SETTINGS_SECTIONS
    : SETTINGS_SECTIONS.filter((s) => !LEAK_ONLY.includes(s.href));
}
