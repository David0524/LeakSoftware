import type { InvoiceStatus } from "./invoice";
import { formatCents, type Cents } from "./money";
import type { QuoteStatus } from "./quote";

// Wrap-Up as a finish list (owner, 2026-10-22, option A; docs/design/2026-10-22-wrap-up.md):
// a row per step in order (Report, each quote, Customer signs, each invoice), each with its
// state in words, the next step marked, and one button naming the next step's action. The same
// rule on the website, iPhone (SundeckCore/WrapUp.swift) and Android.

export type WrapUpStep = "report" | "quote" | "sign" | "invoice";

export interface WrapUpQuote {
  id: string;
  number: number | null;
  status: QuoteStatus;
  total_cents: Cents;
  /** A deposit payment went through. */
  depositPaid: boolean;
}

export interface WrapUpInvoice {
  id: string;
  number: number | null;
  status: InvoiceStatus;
  total_cents: Cents;
  amount_paid_cents: Cents;
}

export interface WrapUpInput {
  jobType: string;
  customer: string | null;
  /** The shop uses the homeowner report (it can be turned off in settings). */
  reportOn: boolean;
  /** The report has a draft with text to read. */
  hasDraft: boolean;
  /** The newest finished (sent) version's number, if any. */
  sentVersion: number | null;
  /** Why the newest finished version wasn't signed ("Customer not present"), if it says. */
  unsignedReason: string | null;
  findings: number;
  tests: number;
  /** Who signed the report's sign-off (not work authorization or quote acceptance). */
  signers: string[];
  quotes: WrapUpQuote[];
  /** The job's invoices; voided ones are left out of the list. */
  invoices: WrapUpInvoice[];
}

export interface WrapUpRow {
  /** Unique within the list: "report", "sign", "quote:<id>", "invoice:<id>" or "invoice". */
  key: string;
  step: WrapUpStep;
  /** The step's number (quote rows share one, as do invoice rows). */
  number: number;
  /** "Report", "Quote #1006", "Customer signs", "Invoice #1025". */
  title: string;
  /** Its state in words: "Draft · not sent". */
  detail: string;
  /** Quotes and invoices: the total. */
  amount: string | null;
  done: boolean;
  /** This row is the next thing to do: a blue marker. */
  next: boolean;
  /** What tapping the row opens: its own step, or Report while there's no report to sign. */
  opens: WrapUpStep;
  /** The quote or invoice the row is about. */
  id: string | null;
  /** What VoiceOver and TalkBack read: "Step 3 of 4, Customer signs, not yet, next". */
  spoken: string;
}

export interface WrapUpNext {
  step: WrapUpStep;
  /** The quote or invoice, for its sheet. */
  id: string | null;
  /** The bottom button: "Write the Draft", "Send Quote", "Review with Customer", "Send Invoice". */
  action: string;
}

export interface WrapUp {
  rows: WrapUpRow[];
  done: number;
  total: number;
  /** "Maria Alvarez · 2 of 4 done", "Maria Alvarez · All done". */
  subtitle: string;
  /** Null when every step is done: the button is hidden. */
  next: WrapUpNext | null;
  /** The "New Quote" row under the list: no draft or accepted quote, and not a repair job. */
  canStartQuote: boolean;
}

export const WRAP_UP_ACTIONS: Record<WrapUpStep, string> = {
  report: "Write the Draft",
  quote: "Send Quote",
  sign: "Review with Customer",
  invoice: "Send Invoice",
};

export const NEW_QUOTE_LABEL = "New Quote";

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function reportDetail(i: WrapUpInput): string {
  if (i.hasDraft) {
    const parts = [
      i.findings ? plural(i.findings, "finding") : null,
      i.tests ? plural(i.tests, "test") : null,
    ].filter((p): p is string => !!p);
    return parts.length ? `Draft ready · ${parts.join(", ")}` : "Draft ready";
  }
  if (i.sentVersion != null) return `Sent · version ${i.sentVersion}`;
  return "Not written yet";
}

function quoteDetail(q: WrapUpQuote): string {
  switch (q.status) {
    case "draft":
      return "Draft · not sent";
    case "sent":
      return "Sent · waiting";
    case "accepted":
      return q.depositPaid ? "Accepted · deposit paid" : "Accepted";
    case "declined":
      return "Declined";
    case "expired":
      return "Expired";
  }
}

function invoiceDetail(v: WrapUpInvoice): string {
  const due = formatCents(Math.max(0, v.total_cents - v.amount_paid_cents));
  switch (v.status) {
    case "draft":
      return "Draft · not sent";
    case "sent":
      return `Sent · ${due} due`;
    case "partially_paid":
      return `Partly paid · ${due} due`;
    case "paid":
      return "Paid";
    case "void":
      return "Void";
  }
}

const byNumber = <T extends { number: number | null }>(a: T, b: T) =>
  (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER);

/** "Not signed: customer not present." keeps the reason's own words, lower-cased at the start. */
function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** The finish list for one job's Wrap-Up. */
export function wrapUp(input: WrapUpInput): WrapUp {
  type Draft = Omit<WrapUpRow, "number" | "next" | "spoken">;
  // One group per step, in order; a group's rows count as one step.
  const groups: { step: WrapUpStep; rows: Draft[] }[] = [];
  const reportDone = input.hasDraft || input.sentVersion != null;

  if (input.reportOn) {
    groups.push({
      step: "report",
      rows: [
        {
          key: "report",
          step: "report",
          title: "Report",
          detail: reportDetail(input),
          amount: null,
          done: reportDone,
          opens: "report",
          id: null,
        },
      ],
    });
  }

  // A repair job is the quote's work: it has no quote rows.
  const quotes = input.jobType === "repair" ? [] : [...input.quotes].sort(byNumber);
  if (quotes.length) {
    groups.push({
      step: "quote",
      rows: quotes.map((q) => ({
        key: `quote:${q.id}`,
        step: "quote",
        title: q.number != null ? `Quote #${q.number}` : "Quote",
        detail: quoteDetail(q),
        amount: formatCents(q.total_cents),
        done: q.status !== "draft",
        opens: "quote",
        id: q.id,
      })),
    });
  }

  if (input.reportOn) {
    const signers = [...new Set(input.signers.map((s) => s.trim()).filter(Boolean))];
    const reason = input.unsignedReason?.trim() || null;
    // Sent without a signature and without a reason: nothing is left to sign.
    const sentUnsigned = !input.hasDraft && input.sentVersion != null;
    const done = signers.length > 0 || !!reason || sentUnsigned;
    const detail = signers.length
      ? `Signed by ${signers.join(", ")}`
      : reason
        ? `Not signed: ${lowerFirst(reason)}`
        : sentUnsigned
          ? "Sent without a signature"
          : reportDone
            ? "Not yet"
            : "Write the report first";
    groups.push({
      step: "sign",
      rows: [
        {
          key: "sign",
          step: "sign",
          title: "Customer signs",
          detail,
          amount: null,
          done,
          // Nothing to sign before the report has a draft.
          opens: done || reportDone ? "sign" : "report",
          id: null,
        },
      ],
    });
  }

  const invoices = input.invoices.filter((v) => v.status !== "void").sort(byNumber);
  groups.push({
    step: "invoice",
    rows: invoices.length
      ? invoices.map((v) => ({
          key: `invoice:${v.id}`,
          step: "invoice",
          title: v.number != null ? `Invoice #${v.number}` : "Invoice",
          detail: invoiceDetail(v),
          amount: formatCents(v.total_cents),
          done: v.status !== "draft",
          opens: "invoice",
          id: v.id,
        }))
      : [
          {
            key: "invoice",
            step: "invoice",
            title: "Invoice",
            detail: "Not started",
            amount: null,
            done: false,
            opens: "invoice",
            id: null,
          },
        ],
  });

  const total = groups.length;
  const groupDone = groups.map((g) => g.rows.every((r) => r.done));
  const done = groupDone.filter(Boolean).length;
  let nextGroup = groupDone.findIndex((d) => !d);
  // Customer signs can't be next before the report has a draft.
  if (nextGroup >= 0 && groups[nextGroup]!.step === "sign" && !reportDone) nextGroup = -1;

  let next: WrapUpNext | null = null;
  const rows: WrapUpRow[] = groups.flatMap((g, gi) => {
    const number = gi + 1;
    // The next step's first unfinished row carries the blue marker.
    const nextRow = gi === nextGroup ? g.rows.find((r) => !r.done) : undefined;
    if (nextRow) next = { step: g.step, id: nextRow.id, action: WRAP_UP_ACTIONS[g.step] };
    return g.rows.map((r) => {
      const isNext = r === nextRow;
      const spoken = [
        `Step ${number} of ${total}`,
        r.title,
        lowerFirst(r.detail.replace(/ · /g, ", ")),
        r.amount,
        r.done ? "done" : isNext ? "next" : null,
      ]
        .filter((p): p is string => !!p)
        .join(", ");
      return { ...r, number, next: isNext, spoken };
    });
  });

  const counted = done === total ? "All done" : `${done} of ${total} done`;
  const customer = input.customer?.trim();
  return {
    rows,
    done,
    total,
    subtitle: customer ? `${customer} · ${counted}` : counted,
    next,
    canStartQuote:
      input.jobType !== "repair" &&
      !input.quotes.some((q) => q.status === "draft" || q.status === "accepted"),
  };
}
