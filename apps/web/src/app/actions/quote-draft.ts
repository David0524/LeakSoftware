"use server";

import { revalidatePath } from "next/cache";
import {
  discountAllowed,
  lineFromItem,
  lineTotal,
  parseDollars,
  quoteTotals,
  uuidv7,
  type CompanySettings,
  type PriceBookItem,
  type QuoteLine,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

// Building a quote on the website (M9.5), the same steps as the phone's Quote tab. Drafts are
// written as the signed-in member; sending (actions/quotes.ts) recomputes the totals and
// checks the tech discount limit on the server.

type Result = { ok: true } | { ok: false; error: string };
type Db = Awaited<ReturnType<typeof createClient>>;

async function ctx() {
  const office = await getOffice();
  const [db, company] = await Promise.all([createClient(), getCompany(office)]);
  return { office, db, settings: company.settings as Partial<CompanySettings> };
}

const DEFAULT_DEPOSIT: CompanySettings["deposit"] = {
  type: "percent",
  value_bps: 0,
  minimum_cents: 0,
};

async function draft(db: Db, quoteId: string) {
  const { data } = await db
    .from("quote")
    .select("id, job_id, status, discount_cents")
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.status === "draft" ? data : null;
}

async function liveLines(db: Db, quoteId: string) {
  const { data } = await db
    .from("quote_line_item")
    .select("id, quantity, unit_price_cents, taxable, sort_order")
    .eq("quote_id", quoteId)
    .is("deleted_at", null);
  return (data ?? []).map((l) => ({ ...l, quantity: Number(l.quantity) }));
}

/** Save the draft's totals so the office list and the customer page show current numbers. */
async function saveTotals(
  db: Db,
  settings: Partial<CompanySettings>,
  quoteId: string,
  jobId: string,
  discountCents: number,
): Promise<Result> {
  const t = quoteTotals(
    (await liveLines(db, quoteId)) as QuoteLine[],
    discountCents,
    settings.tax_rate_bps ?? 0,
    settings.deposit ?? DEFAULT_DEPOSIT,
  );
  const { error } = await db
    .from("quote")
    .update({
      subtotal_cents: t.subtotal_cents,
      discount_cents: discountCents,
      tax_cents: t.tax_cents,
      total_cents: t.total_cents,
      deposit_cents: t.deposit_cents,
    })
    .eq("id", quoteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

export async function startQuote(jobId: string): Promise<Result> {
  const { office, db } = await ctx();
  const { error } = await db.from("quote").insert({
    id: uuidv7(),
    company_id: office.company.id,
    job_id: jobId,
    discount_cents: 0,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

async function insertLine(
  quoteId: string,
  line: QuoteLine & { description: string },
): Promise<Result> {
  const { office, db, settings } = await ctx();
  const quote = await draft(db, quoteId);
  if (!quote) return { ok: false, error: "This quote was already sent." };
  const lines = await liveLines(db, quoteId);
  const { error } = await db.from("quote_line_item").insert({
    id: uuidv7(),
    company_id: office.company.id,
    quote_id: quoteId,
    description: line.description,
    quantity: line.quantity,
    unit_price_cents: line.unit_price_cents,
    taxable: line.taxable,
    finding_id: line.finding_id ?? null,
    price_book_item_id: line.price_book_item_id ?? null,
    sort_order: Math.max(0, ...lines.map((l) => l.sort_order)) + 1,
  });
  if (error) return { ok: false, error: error.message };
  return saveTotals(db, settings, quoteId, quote.job_id, quote.discount_cents);
}

/** A price book item, priced as it is today (later price changes don't touch the quote). */
export async function addPriceBookLine(input: {
  quoteId: string;
  itemId: string;
  findingId: string | null;
}): Promise<Result> {
  const db = await createClient();
  const { data: item } = await db
    .from("price_book_item")
    .select("*")
    .eq("id", input.itemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "Pick an item from the price book." };
  const line = lineFromItem(item as PriceBookItem, input.findingId);
  return insertLine(input.quoteId, { ...line, description: line.description ?? item.name });
}

export async function addCustomLine(input: {
  quoteId: string;
  description: string;
  price: string;
}): Promise<Result> {
  const cents = parseDollars(input.price);
  if (!input.description.trim()) return { ok: false, error: "Describe the work." };
  if (cents === null || cents < 0) return { ok: false, error: "Enter a price like 125 or 125.50." };
  return insertLine(input.quoteId, {
    description: input.description.trim(),
    quantity: 1,
    unit_price_cents: cents,
    taxable: true,
  });
}

export async function updateQuoteLine(input: {
  quoteId: string;
  lineId: string;
  description: string;
  quantity: string;
  price: string;
}): Promise<Result> {
  const { db, settings } = await ctx();
  const quote = await draft(db, input.quoteId);
  if (!quote) return { ok: false, error: "This quote was already sent." };
  const quantity = Number(input.quantity.replace(",", "."));
  const cents = parseDollars(input.price);
  if (!input.description.trim()) return { ok: false, error: "Describe the work." };
  if (!(quantity > 0 && quantity < 100_000))
    return { ok: false, error: "Quantity must be more than 0." };
  if (cents === null || cents < 0) return { ok: false, error: "Enter a price like 125 or 125.50." };
  const { error } = await db
    .from("quote_line_item")
    .update({
      description: input.description.trim(),
      quantity: Math.round(quantity * 100) / 100,
      unit_price_cents: cents,
    })
    .eq("id", input.lineId)
    .eq("quote_id", input.quoteId);
  if (error) return { ok: false, error: error.message };
  return saveTotals(db, settings, input.quoteId, quote.job_id, quote.discount_cents);
}

export async function removeQuoteLine(input: { quoteId: string; lineId: string }): Promise<Result> {
  const { db, settings } = await ctx();
  const quote = await draft(db, input.quoteId);
  if (!quote) return { ok: false, error: "This quote was already sent." };
  const { error } = await db
    .from("quote_line_item")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.lineId)
    .eq("quote_id", input.quoteId);
  if (error) return { ok: false, error: error.message };
  return saveTotals(db, settings, input.quoteId, quote.job_id, quote.discount_cents);
}

/** A discount off the subtotal. Techs are held to the company's limit; owners are not. */
export async function setQuoteDiscount(input: {
  quoteId: string;
  discount: string;
}): Promise<Result> {
  const { office, db, settings } = await ctx();
  const quote = await draft(db, input.quoteId);
  if (!quote) return { ok: false, error: "This quote was already sent." };
  const cents = input.discount.trim() === "" ? 0 : parseDollars(input.discount);
  if (cents === null || cents < 0)
    return { ok: false, error: "Enter a discount like 50 or 50.00." };
  const subtotal = (await liveLines(db, input.quoteId)).reduce((sum, l) => sum + lineTotal(l), 0);
  const limit = settings.tech_discount_limit_bps ?? 0;
  if (!discountAllowed(subtotal, cents, office.isOwner, limit))
    return {
      ok: false,
      error: `Techs can give up to ${limit / 100}% off. Ask an owner for more.`,
    };
  return saveTotals(db, settings, input.quoteId, quote.job_id, cents);
}
