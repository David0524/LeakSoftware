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
  /**
   * The shop's sample job (owner, 2026-10-22: first win): its id while it's there, and whether
   * the owner sent its report to themselves (or deleted it, which also ends the step). Absent
   * for shops that never had one (pool care, and shops from before).
   */
  sample?: { jobId: string | null; done: boolean } | null;
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
    // A head start (owner, 2026-10-22: goal-gradient): the list opens at 1 of N done.
    {
      id: "account",
      label: "Account created",
      detail: "Your shop is on Sundeck Pro.",
      href: "/settings/company",
      done: true,
    },
    // The first win (owner, 2026-10-22): a finished report with the shop's own logo, sent to
    // themselves, before anything else.
    !!p.sample &&
      (p.sample.jobId !== null || p.sample.done) && {
        id: "sample",
        label: "Send yourself the sample report",
        detail: "See what your customers get, with your shop's name and logo.",
        href: p.sample.jobId ? `/jobs/${p.sample.jobId}` : "/jobs",
        done: p.sample.done,
      },
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
