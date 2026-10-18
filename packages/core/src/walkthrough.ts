import type { Services } from "./models";

// The walkthrough after onboarding (owner, 2026-10-16): no single guided tour, but a tip on
// each screen the first time someone opens it (HIG Onboarding: "consider providing a
// collection of context-specific tips"), a Getting Started checklist for owners on the
// website, and three cards when the phone app first opens. Each varies by role (owner or
// tech) and package (pool care or leak detection). Every tip names a feature that exists
// on that screen; check the screen before changing a tip's words.

export type Platform = "web" | "app";
export type TipRole = "owner" | "tech";
export type TipPackage = "pool" | "leak";

export interface Tip {
  id: string;
  platform: Platform;
  /** The screen it sits on (the page's or route's short name). */
  screen: string;
  roles: TipRole[];
  /** Shops that do this package see it; omitted: every shop. */
  pkg?: TipPackage;
  title: string;
  message: string;
}

const EVERYONE: TipRole[] = ["owner", "tech"];
const OWNERS: TipRole[] = ["owner"];

export const TIPS: Tip[] = [
  // Website
  {
    id: "web-today",
    platform: "web",
    screen: "today",
    roles: EVERYONE,
    title: "Your day, stop by stop",
    message:
      "Today lists the stops in order, with directions. On My Way texts the customer that you’re coming.",
  },
  {
    id: "web-schedule",
    platform: "web",
    screen: "schedule",
    roles: OWNERS,
    title: "Day, week, or month",
    message:
      "Switch views at the top. Plan Route puts a tech’s stops for the day in driving order.",
  },
  {
    id: "web-messages",
    platform: "web",
    screen: "messages",
    roles: EVERYONE,
    title: "One inbox for the whole shop",
    message:
      "Texts to the shop number land here for everyone. Swipe a conversation, or right-click it on a computer, to mark it unread.",
  },
  {
    id: "web-customers-pool",
    platform: "web",
    screen: "customers",
    roles: OWNERS,
    pkg: "pool",
    title: "Give each pool a visit plan",
    message:
      "Open a customer to set the day, how often, and the price per visit. Visits then appear on the schedule weeks ahead.",
  },
  {
    id: "web-invoices-pool",
    platform: "web",
    screen: "invoices",
    roles: OWNERS,
    pkg: "pool",
    title: "Monthly billing, drafted for you",
    message:
      "At the start of each month, Sundeck Pro drafts one invoice per customer from last month’s finished visits. Review them, then send.",
  },
  {
    id: "web-invoices-leak",
    platform: "web",
    screen: "invoices",
    roles: OWNERS,
    pkg: "leak",
    title: "Get paid online",
    message:
      "Customers pay an invoice by card, Apple Pay, or bank from the link you send, and it’s marked paid on its own.",
  },
  {
    id: "web-dashboard",
    platform: "web",
    screen: "dashboard",
    roles: OWNERS,
    title: "Your shop at a glance",
    message: "Money collected, what you’re owed, and quotes accepted, month by month.",
  },
  {
    id: "web-chemicals",
    platform: "web",
    screen: "chemicals",
    roles: EVERYONE,
    pkg: "pool",
    title: "Readings in, amounts out",
    message:
      "Enter the pool’s gallons and today’s readings. What to Add lists each chemical in the order to add it, in gallons, cups, or pounds.",
  },
  {
    id: "web-jobs-leak",
    platform: "web",
    screen: "jobs",
    roles: EVERYONE,
    pkg: "leak",
    title: "Every job, start to finish",
    message: "Open a job for its checklist, tests, findings, report, and quote, all on one page.",
  },

  // Phone app
  {
    id: "app-jobs",
    platform: "app",
    screen: "jobs",
    roles: EVERYONE,
    title: "Today comes first",
    message:
      "Today’s jobs are at the top. Pull down to sync. Everything works with no signal and sends when you’re back in range.",
  },
  {
    id: "app-visit",
    platform: "app",
    screen: "job",
    roles: EVERYONE,
    pkg: "pool",
    title: "Work down the checklist",
    message:
      "Mark each task Done, Needs Attention, or Skipped. The Chemical Calculator says what to add from your readings.",
  },
  {
    id: "app-inspection",
    platform: "app",
    screen: "job",
    roles: EVERYONE,
    pkg: "leak",
    title: "Inspect step by step",
    message:
      "Checklist for each spot, Tests for pressure and dye readings, Findings for what you found, with photos on each.",
  },
  {
    id: "app-report",
    platform: "app",
    screen: "report",
    roles: EVERYONE,
    pkg: "leak",
    title: "Finish on site",
    message:
      "Write the report from your findings, then go over it with the homeowner and have them sign on your phone.",
  },
  {
    id: "app-chemicals",
    platform: "app",
    screen: "chemicals",
    roles: EVERYONE,
    pkg: "pool",
    title: "Readings in, amounts out",
    message:
      "Enter today’s readings. What to Add lists each chemical in the order to add it, in gallons, cups, or pounds.",
  },
  {
    id: "app-messages",
    platform: "app",
    screen: "messages",
    roles: EVERYONE,
    title: "The shop’s shared inbox",
    message: "Texts to the shop number land here for the whole team.",
  },
];

const offers = (services: Services, pkg: TipPackage | undefined) =>
  !pkg || services === "both" || services === pkg;

/**
 * The tip to show on a screen, or null. `pkg` narrows to one package when the screen is about
 * one (a pool visit or a leak inspection), whatever else the shop does.
 */
export function tipFor(o: {
  platform: Platform;
  screen: string;
  role: string | null | undefined;
  services: Services;
  seen: readonly string[];
  pkg?: TipPackage;
}): Tip | null {
  const role: TipRole = o.role === "owner" ? "owner" : "tech";
  return (
    TIPS.find(
      (t) =>
        t.platform === o.platform &&
        t.screen === o.screen &&
        t.roles.includes(role) &&
        offers(o.services, t.pkg) &&
        (!o.pkg || !t.pkg || t.pkg === o.pkg) &&
        !o.seen.includes(t.id),
    ) ?? null
  );
}

/** Tip ids from stored data (a user's metadata, a phone's storage), ignoring anything else. */
export function seenTips(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
}

// ---------------------------------------------------------------------------
// The phone app's first launch: three cards, then straight to work
// ---------------------------------------------------------------------------

export interface LaunchCard {
  /** An icon name the app knows (apps/mobile/src/ui/Icon.tsx). */
  icon: "calendar" | "checklist" | "chemistry" | "search" | "report" | "offline";
  title: string;
  message: string;
}

const LAUNCH: Record<"pool" | "leak" | "both", LaunchCard[]> = {
  pool: [
    {
      icon: "calendar",
      title: "Your route, on your phone",
      message: "Today’s visits are at the top of the list, with directions to each pool.",
    },
    {
      icon: "checklist",
      title: "Every visit, the same way",
      message: "Work down the checklist, add photos, and the Chemical Calculator says what to add.",
    },
    {
      icon: "offline",
      title: "No signal? Keep working.",
      message: "Everything saves on the phone and sends when you’re back in range.",
    },
  ],
  leak: [
    {
      icon: "calendar",
      title: "Today’s jobs, in order",
      message: "Your jobs for the day are at the top of the list, with directions.",
    },
    {
      icon: "search",
      title: "Inspect step by step",
      message: "The checklist, pressure and dye tests, photos, and findings, all on the job.",
    },
    {
      icon: "report",
      title: "Report on site, even with no signal",
      message: "The homeowner signs on your phone. It all sends when you’re back in range.",
    },
  ],
  both: [
    {
      icon: "calendar",
      title: "Your day, on your phone",
      message: "Today’s visits and jobs are at the top of the list, with directions.",
    },
    {
      icon: "checklist",
      title: "Visits and inspections",
      message:
        "Pool visits have a checklist and the Chemical Calculator; leak jobs have tests, findings, and a report.",
    },
    {
      icon: "offline",
      title: "No signal? Keep working.",
      message: "Everything saves on the phone and sends when you’re back in range.",
    },
  ],
};

export function launchCards(services: Services): LaunchCard[] {
  return LAUNCH[services];
}

// ---------------------------------------------------------------------------
// Getting Started: owners' first steps on the website, ticked from the shop's own data
// ---------------------------------------------------------------------------

export interface ShopProgress {
  /** Active members, counting the owner. */
  people: number;
  openInvites: number;
  hasLogo: boolean;
  /** Stripe account connected and able to take payments. */
  paymentsReady: boolean;
  customers: number;
  visitPlans: number;
  leakJobs: number;
  reportsSent: number;
  invoicesSent: number;
}

export interface StartStep {
  id: string;
  label: string;
  detail: string;
  href: string;
  done: boolean;
}

export function gettingStarted(services: Services, p: ShopProgress): StartStep[] {
  const pool = services !== "leak";
  const leak = services !== "pool";
  const steps: (StartStep | false)[] = [
    {
      id: "invite",
      label: "Invite your techs",
      detail: "They sign in on the Sundeck Pro app.",
      href: "/settings/team",
      done: p.people > 1 || p.openInvites > 0,
    },
    leak && {
      id: "logo",
      label: "Add your logo",
      detail: "It goes on every report, quote, and invoice.",
      href: "/settings/company",
      done: p.hasLogo,
    },
    pool && {
      id: "customers",
      label: "Add your customers and their pools",
      detail: "Import a spreadsheet, or add them one by one.",
      href: "/settings/import",
      done: p.customers > 0,
    },
    pool && {
      id: "plans",
      label: "Give each pool a visit plan",
      detail: "The day, how often, and the price per visit.",
      href: "/customers",
      done: p.visitPlans > 0,
    },
    {
      id: "payments",
      label: "Set up customer payments",
      detail: "Card, Apple Pay, or bank, paid to your own Stripe account.",
      href: "/settings/payments",
      done: p.paymentsReady,
    },
    leak && {
      id: "job",
      label: "Book your first leak job",
      detail: "Inspect it on the phone.",
      href: "/jobs/new",
      done: p.leakJobs > 0,
    },
    leak && {
      id: "report",
      label: "Send your first report",
      detail: "Finished on site and sent to the homeowner.",
      href: "/jobs",
      done: p.reportsSent > 0,
    },
    pool && {
      id: "invoices",
      label: "Send your first invoices",
      detail: "Monthly billing is drafted from finished visits.",
      href: "/invoices",
      done: p.invoicesSent > 0,
    },
  ];
  return steps.filter((s): s is StartStep => Boolean(s));
}
