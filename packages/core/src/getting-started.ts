import type { Services } from "./models";

// Getting Started (owner, 2026-10-16): owners' first steps on the website, ticked from the
// shop's own data. Each varies by package (pool care or leak detection).

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
