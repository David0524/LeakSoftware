import { router } from "expo-router";
import { Linking } from "react-native";
import { offersLeak, offersPool } from "@leakbook/core";
import { API_URL } from "../../lib/config";
import { useCompany } from "../../state/session";
import { Button, Group, ListRow, Notice, Screen, Section, T } from "../../ui/components";
import { ManagersOnly } from "./SettingsList";

// Settings (spec 5.12; the website's settings index and lib/settings-sections.ts): the pages in
// their groups. Everything is in the app (owner, 2026-10-19: "From the app, do not link to the
// website if you can help it") except Payments (Stripe's own setup) and Import (a spreadsheet
// from a computer).
// Sundeck Pro Billing is left out of the apps (store payment rules, spec 8.4).

/** Pages the app has; the others open the website. */
export const NATIVE_PAGES = [
  "company",
  "team",
  "scheduling",
  "phone",
  "reports",
  "price-book",
  "components",
  "tests",
  "severities",
  "exclusions",
];

const LEAK_ONLY = ["tests", "severities", "exclusions", "reports"];

export function settingsGroups(settings: unknown) {
  const leak = offersLeak(settings);
  const detail: Record<string, string> = {
    company: "Shown on reports, quotes, and invoices",
    team: "Techs, owners, and invites",
    import: "From a spreadsheet or your old software",
    scheduling: "Working day, shop location, and drive times",
    phone: "The company number for texts and calls",
    "price-book": offersPool(settings)
      ? "Services, chemicals, and repairs for quotes"
      : "Detection fees and repairs for quotes",
    payments: "How customers pay, and deposits",
    components: leak ? "What every inspection checks" : "What every visit checks",
    tests: "Tests techs record on the phone",
    severities: "How serious a finding is",
    exclusions: "Why a component wasn’t inspected",
    reports: "Which reports techs can send",
  };
  const label: Record<string, string> = {
    company: "Company and Branding",
    team: "Team",
    import: "Import Customers",
    scheduling: "Scheduling and Routes",
    phone: "Phone and Texting",
    "price-book": "Price Book",
    payments: "Payments and Deposits",
    components: "Checklist Components",
    tests: "Test Types",
    severities: "Severities",
    exclusions: "Exclusion Reasons",
    reports: "Report Templates",
  };
  const groups = [
    { title: "Your shop", pages: ["company", "team", "import", "scheduling", "phone"] },
    { title: "Money", pages: ["price-book", "payments"] },
    {
      title: leak ? "Checklists and reports" : "Checklists",
      pages: ["components", "tests", "severities", "exclusions", "reports"],
    },
  ];
  return groups.map((g) => ({
    title: g.title,
    pages: g.pages
      .filter((p) => leak || !LEAK_ONLY.includes(p))
      .map((p) => ({ page: p, label: label[p]!, detail: detail[p]! })),
  }));
}

export function SettingsIndex() {
  return (
    <ManagersOnly title="Settings">
      <SettingsIndexPage />
    </ManagersOnly>
  );
}

function SettingsIndexPage() {
  const company = useCompany();
  return (
    <Screen title="Settings">
      {settingsGroups(company.settings).map((g) => (
        <Section key={g.title} title={g.title}>
          <Group>
            {g.pages.map((p) => (
              <ListRow
                key={p.page}
                title={p.label}
                subtitle={p.detail}
                accessibilityHint={
                  NATIVE_PAGES.includes(p.page) || p.page === "import"
                    ? undefined
                    : "Opens on the website"
                }
                onPress={() =>
                  NATIVE_PAGES.includes(p.page) || p.page === "import" || !API_URL
                    ? router.push(`/settings/${p.page}`)
                    : void Linking.openURL(`${API_URL}/settings/${p.page}`)
                }
              />
            ))}
          </Group>
        </Section>
      ))}
    </Screen>
  );
}

/** A settings page the app doesn't have: what it's for, and the website. */
export function WebsitePage({ page }: { page: string }) {
  const company = useCompany();
  const found = settingsGroups(company.settings)
    .flatMap((g) => g.pages)
    .find((p) => p.page === page);
  const title = found?.label ?? "Settings";
  const url = API_URL ? `${API_URL}/settings/${page}` : null;
  if (page === "import")
    return (
      <ManagersOnly title={title}>
        <Screen title={title}>
          <Notice>
            {`Import from a computer at ${url ? url.replace(/^https?:\/\//, "") : "sundeckpro.com"}. A spreadsheet or your old software’s export goes in there.`}
          </Notice>
        </Screen>
      </ManagersOnly>
    );
  return (
    <ManagersOnly title={title}>
      <Screen title={title} subtitle={found?.detail}>
        <T muted>
          {page === "payments"
            ? "Setting up customer payments happens with Stripe on the website."
            : page === "phone"
              ? "Choosing and buying the company number happens on the website."
              : "This page opens on the website."}
        </T>
        {url ? (
          <Button
            title="Open on the Website"
            kind="secondary"
            onPress={() => void Linking.openURL(url)}
          />
        ) : null}
      </Screen>
    </ManagersOnly>
  );
}
