// Search Settings (owner, 2026-11-27: "Add a search to the settings page"): a search field at
// the top of Settings, as iOS Settings has. It finds a page by its name or by a setting on it
// ("deposit" finds Payments and Deposits), and each result says which setting matched. The same
// on the website, iPhone (SundeckCore/SettingsSearch.swift) and Android. No I/O.

/** Each settings page by its key (the website's /settings/<key>), and what's on it. */
export const SETTINGS_SEARCH: Record<string, { label: string; terms: string[] }> = {
  company: {
    label: "Company and Branding",
    terms: [
      "Company name",
      "Legal name",
      "Phone",
      "Email",
      "Address",
      "Time zone",
      "Review link",
      "Services",
      "Quote reminders",
      "Invoice reminders",
      "Review requests",
      "Ask How We Did First",
      "Report terms",
      "Disclaimer",
      "Job numbers",
      "Logo",
      "Main color",
      "Accent color",
      "Branding",
      "Second business",
    ],
  },
  team: {
    label: "Team",
    terms: [
      "Invite",
      "Roles",
      "Owners",
      "Admins",
      "Techs",
      "Tech colors",
      "Tech photos",
      "Profiles",
      "Emergency contact",
      "Text and Call Customers",
      "Techs see every job",
      "Techs make new jobs",
      "Turn off access",
    ],
  },
  import: {
    label: "Import Customers",
    terms: ["Spreadsheet", "CSV", "Old software", "Customers"],
  },
  scheduling: {
    label: "Scheduling and Routes",
    terms: ["Working day", "Shop location", "Drive times", "Routes", "Start from home"],
  },
  phone: {
    label: "Phone and Texting",
    terms: ["Company number", "Texts", "Calls", "Voicemail", "On My Way"],
  },
  "price-book": {
    label: "Price Book",
    terms: ["Prices", "Services", "Chemicals", "Repairs", "Detection fee", "Charge for Chemicals"],
  },
  payments: {
    label: "Payments and Deposits",
    terms: [
      "Deposit",
      "Stripe",
      "Card payments",
      "Card fee",
      "Autopay",
      "Invoice day",
      "Sales tax",
      "Discount limit",
      "Import saved cards",
    ],
  },
  billing: {
    label: "Sundeck Pro Billing",
    terms: ["Subscription", "Plan", "Receipts"],
  },
  components: {
    label: "Checklist Components",
    terms: ["Checklist", "Skimmer", "Main drain", "Returns", "Lights"],
  },
  tests: {
    label: "Test Types",
    terms: ["Pressure test", "Bucket test", "Dye test", "Thresholds"],
  },
  severities: { label: "Severities", terms: ["Findings"] },
  exclusions: { label: "Exclusion Reasons", terms: ["Not inspected"] },
  "skip-reasons": { label: "Skip Reasons", terms: ["Skip Visit"] },
  reports: {
    label: "Report Templates",
    terms: [
      "Visit reports",
      "Monthly reports",
      "Require a Photo",
      "Show the Tech on Reports",
      "Saved reports",
    ],
  },
};

export interface SettingsSearchResult {
  key: string;
  label: string;
  /** The setting that matched, or null when the page's own name did. */
  match: string | null;
}

export const SETTINGS_SEARCH_TEXT = {
  placeholder: "Search",
  label: "Search Settings",
  /** No results: `noResults(query)`. */
} as const;

/** "No Results for “deposit”", as iOS says it. */
export function settingsNoResults(query: string): string {
  return `No Results for “${query.trim()}”`;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Every word of the query starts a word of the text ("dep" finds "Deposit"). */
function matches(text: string, words: string[]): boolean {
  const have = fold(text).split(" ");
  return words.every((w) => have.some((h) => h.startsWith(w)));
}

/**
 * The pages a search finds, in Settings' order, among the pages this shop has (`keys`, in the
 * order shown). A page whose name matches comes with no setting; otherwise with the first of its
 * settings that matches. An empty query finds nothing (Settings shows its usual list).
 */
export function searchSettings(query: string, keys: string[]): SettingsSearchResult[] {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const out: SettingsSearchResult[] = [];
  for (const key of keys) {
    const page = SETTINGS_SEARCH[key];
    if (!page) continue;
    if (matches(page.label, words)) {
      out.push({ key, label: page.label, match: null });
      continue;
    }
    const term = page.terms.find((t) => matches(t, words));
    if (term) out.push({ key, label: page.label, match: term });
  }
  return out;
}
