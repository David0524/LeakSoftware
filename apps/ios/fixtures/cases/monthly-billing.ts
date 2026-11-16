import {
  AUTO_SEND_ON_FOOTER,
  CHARGE_LOCKED,
  INVOICE_DAYS,
  INVOICE_DAY_FOOTER,
  NO_WAY_TO_SEND,
  PLAN_INVOICE_DAY_FOOTER,
  SEND_ALL_FOOTER,
  billingMonthDetail,
  billingMonthName,
  chargeCents,
  chargeDetail,
  chargeItems,
  chargesFooter,
  linesSummary,
  monthBillingSubtitle,
  notInvoicedText,
  ordinalDay,
  parseInvoiceDay,
  planInvoiceDayLabel,
  sendAllConfirm,
  sendAllLabel,
  sendAllResult,
  autoSendFailed,
  sendRoute,
  sendRouteLabel,
  shopInvoiceDay,
  type BillingMonth,
  type MonthBilling,
  type MonthBillingInvoice,
  type MonthBillingLine,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// monthly-billing.ts (owner, 2026-11-15: "a way to invoice all service customers at once";
// "add extra charges for each customer"; "set the invoice date when setting up a new recurring
// job"): charges on a visit, invoice days, and Monthly Billing's Send All, in the apps' words.

const items = [
  { id: "pump", name: "Replace pump motor", category: "Repair", chemical: null, deleted_at: null },
  { id: "basket", name: "Skimmer basket", category: "Parts", chemical: null, deleted_at: null },
  { id: "filter", name: "Clean filter", category: "Service", chemical: null, deleted_at: null },
  {
    id: "cl",
    name: "Liquid chlorine",
    category: "Chemicals",
    chemical: "liquid_chlorine",
    deleted_at: null,
  },
  { id: "enzyme", name: "Enzyme", category: "Chemicals", chemical: null, deleted_at: null },
  { id: "detect", name: "Leak detection", category: "Detection", chemical: null, deleted_at: null },
  {
    id: "inspect",
    name: "Pool inspection",
    category: "Inspection",
    chemical: null,
    deleted_at: null,
  },
  { id: "tabs", name: "Tabs", category: null, chemical: "tabs", deleted_at: null },
  {
    id: "gone",
    name: "Old part",
    category: "Parts",
    chemical: null,
    deleted_at: "2026-10-01T00:00:00Z",
  },
  { id: "blank", name: "Uncategorized", category: null, chemical: "", deleted_at: "" },
];

const line = (
  id: string,
  description: string,
  kind = "item",
  quantity = 1,
  unit_price_cents = 2400,
): MonthBillingLine => ({
  id,
  description,
  quantity,
  unit_price_cents,
  unit: null,
  kind,
  taxable: true,
});

const invoice = (
  id: string,
  status: string,
  email: string | null,
  phone: string | null,
  total_cents: number,
  lines: MonthBillingLine[],
): MonthBillingInvoice => ({
  id,
  number: status === "draft" ? null : 1042,
  status,
  job_id: `job-${id}`,
  customer_id: `cus-${id}`,
  customer: `Customer ${id}`,
  email,
  phone,
  total_cents,
  amount_paid_cents: 0,
  sent_at: status === "draft" ? null : "2026-11-01T16:00:00Z",
  due_date: null,
  lines,
});

const october: MonthBilling = {
  month: "2026-10-01",
  invoices: [
    invoice("a", "draft", "jane@example.com", null, 16400, [
      line("a1", "Pool service, October"),
      line("a2", "Replace skimmer basket, Oct 14"),
    ]),
    invoice("b", "draft", null, "(555) 123-4567", 12000, [line("b1", "Pool service, October")]),
    invoice("c", "sent", "c@example.com", null, 9900, []),
  ],
  not_invoiced: 3,
  waiting: [{ date: "2026-11-15", customers: 2 }],
};

const allSent: MonthBilling = {
  month: "2026-09-01",
  invoices: [invoice("d", "paid", "d@example.com", null, 5000, [])],
  not_invoiced: 1,
  waiting: [],
};

const empty: MonthBilling = { month: "2026-11-01", invoices: [], not_invoiced: 0, waiting: [] };

const months: BillingMonth[] = [
  {
    month: "2026-10-01",
    drafts: 38,
    draft_total_cents: 591200,
    sent: 2,
    not_invoiced: 3,
    current: false,
  },
  { month: "2026-11-01", drafts: 0, draft_total_cents: 0, sent: 0, not_invoiced: 1, current: true },
  {
    month: "2026-09-01",
    drafts: 1,
    draft_total_cents: 4500,
    sent: 0,
    not_invoiced: 0,
    current: false,
  },
  {
    month: "2026-08-01",
    drafts: 0,
    draft_total_cents: 0,
    sent: 5,
    not_invoiced: 0,
    current: false,
  },
];

type Contact = [string | null, string | null, boolean];
const contacts: Contact[] = [
  ["jane@example.com", "(555) 123-4567", true],
  [" jane@example.com ", null, false],
  ["not an email", "(555) 123-4567", true],
  [null, "(555) 123-4567", false],
  [null, "555-1234", true],
  ["", "  +1 702 785 1548 ", true],
  [null, null, true],
];

export const monthlyBilling: ModuleCases = {
  text: rule(
    () => ({
      INVOICE_DAYS,
      INVOICE_DAY_FOOTER,
      PLAN_INVOICE_DAY_FOOTER,
      CHARGE_LOCKED,
      NO_WAY_TO_SEND,
      SEND_ALL_FOOTER,
      AUTO_SEND_ON_FOOTER,
    }),
    [[]],
  ),
  ordinalDay: rule(
    (d: number) => ordinalDay(d),
    [[1], [2], [3], [4], [11], [12], [13], [21], [22], [23], [28]],
  ),
  shopInvoiceDay: rule(
    (s: Record<string, unknown> | null) => shopInvoiceDay(s),
    [
      [null],
      [{}],
      [{ invoice_day: 15 }],
      [{ invoice_day: "20" }],
      [{ invoice_day: 29 }],
      [{ invoice_day: 0 }],
      [{ invoice_day: 1.5 }],
      [{ invoice_day: "x" }],
    ],
  ),
  parseInvoiceDay: rule(
    (input: string | number | null) => parseInvoiceDay(input),
    [[null], [""], ["1"], ["28"], ["29"], ["0"], ["2.5"], [15], ["abc"]],
  ),
  planInvoiceDayLabel: rule(
    (day: number | null, shop: number) => planInvoiceDayLabel(day, shop),
    [
      [null, 1],
      [null, 15],
      [3, 1],
      [22, 15],
    ],
  ),
  chargeCents: rule(
    (quantity: number, unit_price_cents: number) => chargeCents({ quantity, unit_price_cents }),
    [
      [1, 2400],
      [2.5, 800],
      [0.33, 1999],
      [3, 0],
      [1.15, 1000],
    ],
  ),
  chargeDetail: rule(
    (quantity: number, unit_price_cents: number) => chargeDetail({ quantity, unit_price_cents }),
    [
      [1, 2400],
      [2.5, 800],
      [2.25, 1000],
      [1.1, 65000],
      [10, 123456],
    ],
  ),
  chargeItems: rule(() => chargeItems(items).map((i) => i.id), [[]]),
  chargesFooter: rule(
    (firstName: string, month: string, sent: { number: number | null; sentOn: string } | null) =>
      chargesFooter({ firstName, month, sentInvoice: sent }),
    [
      ["Jane", "October", null],
      ["Jane", "October", { number: 1042, sentOn: "Nov 1" }],
      ["the customer", "November", { number: null, sentOn: "Dec 1" }],
    ],
  ),
  billingMonthName: rule(
    (month: string, withYear: boolean) => billingMonthName(month, withYear),
    [
      ["2026-10-01", true],
      ["2026-10-01", false],
      ["2027-01-01", true],
      ["2026-12-01", false],
    ],
  ),
  billingMonthDetail: rule(
    (m: BillingMonth) => billingMonthDetail(m),
    months.map((m) => [m] as [BillingMonth]),
  ),
  sendRoute: rule(
    (email: string | null, phone: string | null, texting: boolean) =>
      sendRoute({ email, phone }, texting),
    contacts,
  ),
  sendRouteLabel: rule(
    (email: string | null, phone: string | null, texting: boolean) =>
      sendRouteLabel(sendRoute({ email, phone }, texting)),
    contacts,
  ),
  linesSummary: rule(
    (lines: MonthBillingLine[], shown: number | null) => linesSummary(lines, shown ?? undefined),
    [
      [october.invoices[0]!.lines, null],
      [[], null],
      [
        [
          line("1", "Pool service, October"),
          line("2", "Deposit", "deposit_credit"),
          line("3", "Replace skimmer basket, Oct 14"),
          line("4", "Clean filter, Oct 21"),
          line("5", "Salt, 40 lb bag, Oct 2"),
        ],
        null,
      ],
      [[line("1", "Clean filter, Oct 21"), line("2", "Light, bulb, Oct 3")], 1],
      [[line("1", "Deposit", "deposit_credit")], null],
    ],
  ),
  monthBillingSubtitle: rule(
    (b: MonthBilling) => monthBillingSubtitle(b),
    [[october], [allSent], [empty]],
  ),
  notInvoicedText: rule(
    (b: MonthBilling) => notInvoicedText(b, (iso) => `[${iso}]`),
    [
      [october],
      [allSent],
      [empty],
      [{ ...october, not_invoiced: 2 }],
      [{ ...october, not_invoiced: 1, waiting: [{ date: "2026-11-15", customers: 1 }] }],
      [
        {
          ...october,
          not_invoiced: 1,
          waiting: [
            { date: "2026-11-15", customers: 1 },
            { date: "2026-11-20", customers: 3 },
          ],
        },
      ],
    ],
  ),
  sendAllLabel: rule((n: number) => sendAllLabel(n), [[38], [1], [0]]),
  sendAllConfirm: rule(
    (list: Contact[], month: string) =>
      sendAllConfirm(
        list.map(([email, phone, texting]) => sendRoute({ email, phone }, texting)),
        month,
      ),
    [
      [contacts, "October"],
      [[contacts[0]!], "November"],
      [[contacts[3]!, contacts[3]!], "October"],
      [[contacts[0]!, contacts[5]!, contacts[6]!, contacts[6]!], "October"],
    ],
  ),
  sendAllResult: rule(
    (sent: number, failed: number) => sendAllResult(sent, failed),
    [
      [38, 0],
      [36, 2],
      [1, 0],
      [0, 1],
    ],
  ),
  autoSendFailed: rule((reason: string) => autoSendFailed(reason), [["No email or mobile number"]]),
};
