import {
  DEFAULT_QUOTE_SEGMENT,
  QUOTE_SEGMENTS,
  validateNewQuote,
  type NewQuoteInput,
  type QuoteSegment,
} from "@leakbook/core";

// Standalone quotes on the website (docs/design/2026-11-24-standalone-quotes.md): the Quotes
// list's address and New Quote's form, read the same way the phones read their screens. Words
// and rules are core's (quote-list.ts).

/** The segment in the address (?segment=), or Sent. */
export function quoteSegmentParam(value: string | undefined): QuoteSegment {
  return QUOTE_SEGMENTS.find((s) => s.key === value)?.key ?? DEFAULT_QUOTE_SEGMENT;
}

/** The Quotes list's address for a segment and search, leaving out what's the default. */
export function quotesHref(segment: QuoteSegment, q = ""): string {
  const p = new URLSearchParams();
  if (segment !== DEFAULT_QUOTE_SEGMENT) p.set("segment", segment);
  if (q.trim()) p.set("q", q.trim());
  return `/quotes${p.size ? `?${p}` : ""}`;
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** New Quote's fields as core's input: an existing customer or a new one, and an optional pool. */
export function newQuoteInput(form: FormData): { input: NewQuoteInput; existing: boolean } {
  const existing = text(form, "customer_mode") === "existing";
  const customerId = existing ? text(form, "customer") || undefined : undefined;
  const pool = existing ? text(form, "property") : "new";
  return {
    existing,
    input: {
      customerId,
      customerName: existing ? "" : text(form, "customer_name"),
      customerPhone: existing ? "" : text(form, "customer_phone"),
      customerEmail: existing ? "" : text(form, "customer_email"),
      propertyId: pool && pool !== "new" ? pool : undefined,
      addressLine1: pool === "new" || !pool ? text(form, "address_line1") : "",
      city: pool === "new" || !pool ? text(form, "city") : "",
      state: pool === "new" || !pool ? text(form, "state") : "",
      postalCode: pool === "new" || !pool ? text(form, "postal_code") : "",
    },
  };
}

/** Core's names, mapped to New Quote's inputs (as New Job's are). */
const FIELD: Partial<Record<keyof NewQuoteInput, string>> = {
  customerName: "customer_name",
  customerEmail: "customer_email",
  addressLine1: "address_line1",
};

/** New Quote's errors by input name: core's validateNewQuote, and a customer to pick. */
export function newQuoteErrors(input: NewQuoteInput, existing: boolean): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(validateNewQuote(input))) {
    // Picking an existing customer, the new customer's fields aren't on the form.
    if (existing && (k === "customerName" || k === "customerEmail")) continue;
    if (v) fields[FIELD[k as keyof NewQuoteInput] ?? k] = v;
  }
  if (existing && !input.customerId) fields.customer = "Pick a customer.";
  return fields;
}
