/**
 * Import Saved Cards (owner, 2026-11-24): a shop moving from other software that kept its
 * customers' cards in Stripe (PayThePoolMan, for one) copies those customers to its Sundeck Pro
 * Stripe account with Stripe's own Copy Customers, then matches each one to a Sundeck customer
 * here. A match saves the card on file and turns the customer's autopay on, as Save for Autopay
 * does; customers don't enter anything again. The words and the matching are shared by the
 * website and the Android app; the iPhone app opens the website's page.
 */

import { savedMethodExpired, savedMethodLabel, type SavedMethod } from "./autopay";

export const CARD_IMPORT_TEXT = {
  title: "Import Saved Cards",
  /** The row on Settings › Payments and Deposits, and its line. */
  rowDetail: "Bring over cards from your old software’s Stripe account",
  footer:
    "Moving from software that kept your customers’ cards in Stripe? Copy them to this account, and their autopay carries on without them signing up again.",
  intro:
    "Your customers’ saved cards can come over from your old software’s Stripe account. They don’t need to do anything.",
  stepsTitle: "Copy Your Customers in Stripe",
  steps: [
    "Sign in to your old Stripe account at dashboard.stripe.com.",
    "Open Customers, then choose Copy Customers › Copy All Customers.",
    "Enter this account’s ID (below) and send the request.",
    "Sign in to this Stripe account and accept the request. Most copies finish within a couple of hours.",
    "Come back here to match the copied customers and turn on their autopay.",
  ],
  accountId: "This Stripe Account’s ID",
  oldSoftware:
    "Turn off autopay in your old software before your next billing here, so nobody is charged twice.",
  ready: "Ready to Import",
  readyFooter: "Matched by email, phone, or name. Turn off any you don’t want on autopay.",
  needsMatch: "Needs a Match",
  needsMatchFooter: "We couldn’t tell who these are. Choose the customer, or leave them out.",
  done: "Already Imported",
  chooseCustomer: "Choose Customer",
  change: "Change",
  leaveOut: "Leave Out",
  search: "Search customers",
  none: "No copied customers with saved cards yet. Once Stripe finishes copying, they show up here.",
  importButton: (n: number) =>
    n === 1 ? "Turn On Autopay for 1 Customer" : `Turn On Autopay for ${n} Customers`,
  confirmTitle: (n: number) =>
    n === 1 ? "Turn on autopay for 1 customer?" : `Turn on autopay for ${n} customers?`,
  confirmBody: "Their saved cards will be charged when their invoices are sent.",
  confirmAction: "Turn On Autopay",
  result: (n: number) =>
    n === 1 ? "Autopay is on for 1 customer." : `Autopay is on for ${n} customers.`,
} as const;

/** A customer in Stripe (copied over) with the card it would bring. */
export interface CardHolder {
  stripe_customer_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  method: (SavedMethod & { id: string }) | null;
}

/** A Sundeck customer, as the matching sees it. */
export interface CardImportCustomer {
  id: string;
  name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  /** The Stripe customer behind their card on file, when they have one. */
  method_stripe_customer: string | null;
}

export type CardMatchReason = "email" | "phone" | "name";

export interface CardImportRow {
  holder: CardHolder;
  /** The Sundeck customer it goes to, or null when it needs a match. */
  customer_id: string | null;
  reason: CardMatchReason | null;
  /** On by default: off when the card has expired or the customer has a card already. */
  selected: boolean;
  /** Why it's off by default, for the row's second line. */
  note: string | null;
}

export interface CardImportPlan {
  ready: CardImportRow[];
  needsMatch: CardImportRow[];
  /** Copied customers already brought over (their card is the customer's card on file). */
  done: number;
  /** Copied customers without a card that can be charged. */
  withoutCard: number;
}

const email = (s: string | null) => s?.trim().toLowerCase() || null;
/** The last ten digits, so "+1 (702) 555-0100" and "702-555-0100" meet. */
const phone = (s: string | null) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};
/**
 * Lowercase letters and digits, words in order ("H.O.A." reads "hoa"); "Smith, Jane" stays apart
 * from "Jane Smith".
 */
const name = (s: string | null) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim() || null;

function index(customers: CardImportCustomer[], key: (c: CardImportCustomer) => (string | null)[]) {
  const map = new Map<string, string[]>();
  for (const c of customers)
    for (const k of new Set(key(c).filter((v): v is string => Boolean(v))))
      map.set(k, [...(map.get(k) ?? []), c.id]);
  return map;
}

const RANK: Record<CardMatchReason, number> = { email: 0, phone: 1, name: 2 };

/**
 * Matches copied Stripe customers to Sundeck customers: by email, then phone, then name (a
 * person's or company's), and only when exactly one customer fits. Two copied customers that
 * land on one Sundeck customer keep the stronger match; a tie sends both to Needs a Match.
 */
export function planCardImport(
  holders: CardHolder[],
  customers: CardImportCustomer[],
  today: string,
): CardImportPlan {
  const byEmail = index(customers, (c) => [email(c.email)]);
  const byPhone = index(customers, (c) => [phone(c.phone)]);
  const byName = index(customers, (c) => [name(c.name), name(c.company_name)]);
  const imported = new Set(customers.map((c) => c.method_stripe_customer).filter(Boolean));
  const withCard = holders.filter((h) => h.method);
  const fresh = withCard.filter((h) => !imported.has(h.stripe_customer_id));

  const found = fresh.map((h) => {
    const tries: [CardMatchReason, string[] | undefined][] = [
      ["email", byEmail.get(email(h.email) ?? "")],
      ["phone", byPhone.get(phone(h.phone) ?? "")],
      ["name", byName.get(name(h.name) ?? "")],
    ];
    const hit = tries.find(([, ids]) => ids?.length === 1);
    return { h, id: hit ? hit[1]![0]! : null, reason: hit ? hit[0] : null };
  });

  // One card per customer: the strongest match wins, and a tie wins for nobody.
  const best = new Map<string, number>();
  const tied = new Set<string>();
  for (const f of found) {
    if (!f.id || !f.reason) continue;
    const have = best.get(f.id);
    if (have === undefined || RANK[f.reason] < have) {
      best.set(f.id, RANK[f.reason]);
      tied.delete(f.id);
    } else if (RANK[f.reason] === have) tied.add(f.id);
  }

  const byId = new Map(customers.map((c) => [c.id, c]));
  const plan: CardImportPlan = {
    ready: [],
    needsMatch: [],
    done: withCard.length - fresh.length,
    withoutCard: holders.length - withCard.length,
  };
  for (const { h, id, reason } of found) {
    const keeps = id && reason && !tied.has(id) && best.get(id) === RANK[reason];
    const expired = savedMethodExpired(h.method!, today);
    if (!keeps) {
      plan.needsMatch.push({
        holder: h,
        customer_id: null,
        reason: null,
        selected: false,
        note: expired ? "Card expired" : null,
      });
      continue;
    }
    const hasCard = Boolean(byId.get(id)?.method_stripe_customer);
    plan.ready.push({
      holder: h,
      customer_id: id,
      reason,
      selected: !expired && !hasCard,
      note: expired
        ? "Card expired"
        : hasCard
          ? "Has a card on file already; importing replaces it"
          : null,
    });
  }
  const byName0 = (a: CardImportRow, b: CardImportRow) =>
    (a.holder.name ?? a.holder.email ?? "").localeCompare(b.holder.name ?? b.holder.email ?? "");
  plan.ready.sort(byName0);
  plan.needsMatch.sort(byName0);
  return plan;
}

/**
 * A ready row's second line: the card, the name in Stripe when it differs from the customer's
 * (so a name match can be checked), and how it matched or why it's off.
 */
export function cardMatchLine(row: CardImportRow, customerName?: string): string {
  const card = row.holder.method ? savedMethodLabel(row.holder.method) : "";
  const other =
    customerName && row.holder.name && name(row.holder.name) !== name(customerName)
      ? `“${row.holder.name.trim()}” in Stripe`
      : "";
  const how = row.reason ? `matched by ${row.reason}` : "";
  return [card, other, row.note ?? how].filter(Boolean).join(" · ");
}

/** How a copied customer reads in a list: their name, else email, else phone. */
export function cardHolderName(h: CardHolder): string {
  return h.name?.trim() || h.email || h.phone || "Unnamed customer";
}
