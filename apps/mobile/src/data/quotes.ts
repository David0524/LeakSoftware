import { useMemo } from "react";
import {
  lineFromItem,
  quoteShareText,
  quoteTotals,
  type Company,
  type PriceBookItem,
  type Quote,
  type QuoteLine,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";
import type { SyncService } from "../lib/sync-service";
import { useRows } from "./hooks";
import { ReportServerError } from "./reports";

export interface QuoteLineRow extends QuoteLine {
  id: string;
  quote_id: string;
  description: string;
  sort_order: number;
}

interface ShareLinkRow {
  token: string;
  quote_id: string | null;
  revoked_at: string | null;
}

/** The job's quotes (newest first), each with its lines and customer link token. */
export function useJobQuotes(companyId: string, jobId: string) {
  const quotes = useRows<Quote>("quote", companyId);
  const lines = useRows<QuoteLineRow>("quote_line_item", companyId);
  const links = useRows<ShareLinkRow>("share_link", companyId);
  return useMemo(
    () =>
      quotes
        .filter((q) => q.job_id === jobId)
        .sort((a, b) => (b.number ?? Infinity) - (a.number ?? Infinity) || b.id.localeCompare(a.id))
        .map((q) => ({
          ...q,
          lines: lines
            .filter((l) => l.quote_id === q.id)
            .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
          token: links.find((l) => l.quote_id === q.id && !l.revoked_at)?.token ?? null,
        })),
    [quotes, lines, links, jobId],
  );
}

export type JobQuote = ReturnType<typeof useJobQuotes>[number];

export function usePriceBook(companyId: string): PriceBookItem[] {
  return useRows<PriceBookItem>("price_book_item", companyId);
}

/** Recompute and save a draft's totals so the office sees current numbers. */
function saveTotals(sync: SyncService, company: Company, quote: Quote, lines: QuoteLine[]) {
  const t = quoteTotals(
    lines,
    quote.discount_cents,
    company.settings.tax_rate_bps ?? 0,
    company.settings.deposit,
  );
  sync.write("quote", quote.id, company.id, {
    subtotal_cents: t.subtotal_cents,
    tax_cents: t.tax_cents,
    total_cents: t.total_cents,
    deposit_cents: t.deposit_cents,
  });
}

export function startQuote(sync: SyncService, companyId: string, jobId: string): string {
  return sync.insert("quote", companyId, { job_id: jobId, discount_cents: 0 });
}

export function addLine(
  sync: SyncService,
  company: Company,
  quote: JobQuote,
  line: QuoteLine & { description: string },
) {
  sync.batch(() => {
    sync.insert("quote_line_item", company.id, {
      quote_id: quote.id,
      description: line.description,
      quantity: line.quantity,
      unit_price_cents: line.unit_price_cents,
      taxable: line.taxable,
      warranty_months: line.warranty_months ?? null,
      finding_id: line.finding_id ?? null,
      price_book_item_id: line.price_book_item_id ?? null,
      sort_order: (quote.lines.at(-1)?.sort_order ?? 0) + 1,
    });
    saveTotals(sync, company, quote, [...quote.lines, line]);
  });
}

export function addItem(
  sync: SyncService,
  company: Company,
  quote: JobQuote,
  item: PriceBookItem,
  findingId: string | null,
) {
  const line = lineFromItem(item, findingId);
  addLine(sync, company, quote, { ...line, description: line.description ?? item.name });
}

export function updateLine(
  sync: SyncService,
  company: Company,
  quote: JobQuote,
  lineId: string,
  values: Partial<Pick<QuoteLine, "quantity" | "unit_price_cents" | "description" | "taxable">>,
) {
  sync.batch(() => {
    sync.write("quote_line_item", lineId, company.id, values as Record<string, JsonValue>);
    saveTotals(
      sync,
      company,
      quote,
      quote.lines.map((l) => (l.id === lineId ? { ...l, ...values } : l)),
    );
  });
}

export function removeLine(sync: SyncService, company: Company, quote: JobQuote, lineId: string) {
  sync.batch(() => {
    sync.write("quote_line_item", lineId, company.id, { deleted_at: new Date().toISOString() });
    saveTotals(
      sync,
      company,
      quote,
      quote.lines.filter((l) => l.id !== lineId),
    );
  });
}

export function setDiscount(sync: SyncService, company: Company, quote: JobQuote, cents: number) {
  sync.batch(() => {
    sync.write("quote", quote.id, company.id, { discount_cents: cents });
    saveTotals(sync, company, { ...quote, discount_cents: cents }, quote.lines);
  });
}

export function quoteLink(token: string | null): string | null {
  return token && API_URL ? `${API_URL}/q/${token}` : null;
}

/** Sends the quote through the LeakBook server; returns the link and a text message. */
export async function sendQuoteFromPhone(quote: JobQuote, shopName: string) {
  const quoteId = quote.id;
  if (!API_URL) throw new ReportServerError("This app isn’t connected to the LeakBook server.");
  const { sync } = getServices();
  await sync.syncNow();
  // Removed lines are no longer in quote.lines, so check every unsent line change.
  if (sync.hasPendingWrites("quote", quoteId) || sync.hasPendingWrites("quote_line_item"))
    throw new ReportServerError("The quote hasn’t reached the server yet. Try again with signal.");
  const token = await sync.accessToken();
  if (!token) throw new ReportServerError("Sign in again to continue.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/quotes/${quoteId}/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ReportServerError("No connection. Try again when you have signal.");
  }
  const data = (await res.json().catch(() => ({}))) as {
    link?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.link)
    throw new ReportServerError(data.error ?? `The server said ${res.status}.`);
  await sync.syncNow();
  return { link: data.link, message: data.message ?? quoteShareText(shopName, data.link) };
}
