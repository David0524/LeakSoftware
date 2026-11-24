import type { Cents } from "./money";
import { formatCents } from "./money";
import type { QuoteStatus } from "./quote";
import type { FormErrors } from "./forms";

// Standalone quotes and the Quotes list (owner, 2026-11-24: "It's more about having the
// ability to send quotes more often. Also instead of creating a full job, we should be able to
// just create a quote for a new/existing customer"; docs/design/2026-11-24-standalone-quotes.md).
// Every platform uses these words and rules; the Swift copy is SundeckCore/QuoteList.swift.

export type QuoteSegment = "draft" | "sent" | "accepted" | "declined";

/** The Quotes list's segmented control, in order. It opens on Sent, the ones to follow up. */
export const QUOTE_SEGMENTS: { key: QuoteSegment; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
];

export const DEFAULT_QUOTE_SEGMENT: QuoteSegment = "sent";

/** Which segment a quote is under. An expired quote can't be accepted, so it is closed too. */
export function quoteSegment(status: QuoteStatus): QuoteSegment {
  if (status === "expired") return "declined";
  return status;
}

export interface QuoteListItem {
  number: number | null;
  status: QuoteStatus;
  total_cents: Cents;
  customer: string | null;
  /** The status of the quote's own job: "quote" for a standalone quote not yet a job. */
  jobStatus: string;
  jobNumber?: number | null;
}

/** An accepted standalone quote whose customer has no pool yet: the office adds one. */
export function quoteWaitingForPool(q: Pick<QuoteListItem, "status" | "jobStatus">): boolean {
  return q.status === "accepted" && q.jobStatus === "quote";
}

export const QUOTE_NEEDS_POOL = "Accepted. Add a pool to schedule the repair.";

/** The quotes a segment and search show, in the order given (newest first). */
export function filterQuotes<T extends QuoteListItem>(
  quotes: T[],
  opts: { segment?: string; q?: string },
): T[] {
  const segment = (QUOTE_SEGMENTS.find((s) => s.key === opts.segment)?.key ??
    DEFAULT_QUOTE_SEGMENT) as QuoteSegment;
  const q = (opts.q ?? "").trim().toLowerCase().replace(/^#/, "");
  return quotes.filter((x) => {
    if (quoteSegment(x.status) !== segment) return false;
    if (!q) return true;
    return (
      (x.customer ?? "").toLowerCase().includes(q) ||
      (x.number != null && String(x.number) === q) ||
      (x.jobNumber != null && String(x.jobNumber) === q)
    );
  });
}

/** How many quotes each segment holds, for the segment labels' counts. */
export function quoteSegmentCounts(
  quotes: Pick<QuoteListItem, "status">[],
): Record<QuoteSegment, number> {
  const counts: Record<QuoteSegment, number> = { draft: 0, sent: 0, accepted: 0, declined: 0 };
  for (const q of quotes) counts[quoteSegment(q.status)] += 1;
  return counts;
}

/** "Quote #1043", or "Quote" before the server numbers it (a phone offline). */
export function quoteTitle(number: number | null | undefined): string {
  return number != null ? `Quote #${number}` : "Quote";
}

/** A row's second line: "Quote #1043 · $1,250.00". */
export function quoteRowDetail(q: Pick<QuoteListItem, "number" | "total_cents">): string {
  return `${quoteTitle(q.number)} · ${formatCents(q.total_cents)}`;
}

/** The empty list, per segment. */
export const QUOTES_EMPTY: Record<QuoteSegment, string> = {
  draft: "No draft quotes.",
  sent: "No quotes waiting on a customer.",
  accepted: "No accepted quotes yet.",
  declined: "No declined or expired quotes.",
};

export const QUOTES_EMPTY_SEARCH = "No quotes match your search.";

// ---------------------------------------------------------------------------
// New Quote: a customer (new or existing), an optional pool, and nothing else.
// ---------------------------------------------------------------------------

export interface NewQuoteInput {
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /** An existing pool, or a new address (optional; all blank means no pool yet). */
  propertyId?: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateNewQuote(input: NewQuoteInput): FormErrors<keyof NewQuoteInput> {
  const errors: FormErrors<keyof NewQuoteInput> = {};
  if (!input.customerId && !input.customerName.trim())
    errors.customerName = "Enter the customer's name.";
  if (!input.customerId && input.customerEmail.trim() && !EMAIL.test(input.customerEmail.trim()))
    errors.customerEmail = "Check the email address.";
  const partOfAddress = [input.city, input.state, input.postalCode].some((s) => s.trim());
  if (!input.propertyId && partOfAddress && !input.addressLine1.trim())
    errors.addressLine1 = "Enter the street address, or leave the address blank.";
  return errors;
}

type Values = Record<string, string | number | boolean | null>;

/**
 * The rows New Quote writes, in one batch: the customer and pool when new (none for an
 * existing one, or no pool at all), the quote job, and the empty quote. The caller adds ids,
 * company_id, the job's property_id and bill_to_customer_id, and the quote's job_id.
 * `assignedUserId` is the person making it when they're a tech, so a tech limited to their
 * own jobs still sees their quote.
 */
export function newQuoteRecords(
  input: NewQuoteInput,
  assignedUserId: string | null,
): {
  customer: Values | null;
  property: Omit<Values, "customer_id"> | null;
  job: Values;
  quote: Values;
} {
  const blankToNull = (s: string) => s.trim() || null;
  const customer = input.customerId
    ? null
    : {
        kind: "homeowner",
        name: input.customerName.trim(),
        phone: blankToNull(input.customerPhone),
        email: blankToNull(input.customerEmail),
      };
  const property =
    input.propertyId || !input.addressLine1.trim()
      ? null
      : {
          address_line1: input.addressLine1.trim(),
          city: blankToNull(input.city),
          state: blankToNull(input.state)?.toUpperCase() ?? null,
          postal_code: blankToNull(input.postalCode),
          has_pool: true,
        };
  return {
    customer,
    property,
    job: { type: "repair", status: "quote", assigned_user_id: assignedUserId },
    quote: { discount_cents: 0 },
  };
}
