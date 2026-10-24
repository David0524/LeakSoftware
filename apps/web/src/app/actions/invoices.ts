"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  checkNumberError,
  parseDollars,
  receiptSentMessage,
  type ReceiptChannel,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { discountTooLarge, friendlyDbError, lineDescriptionError } from "@/lib/limits";
import { parseQuantity } from "@/lib/quantity";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { EmailNotConfigured } from "@/server/email";
import { createInvoice, sendInvoice, sendPaymentReceipt } from "@/server/invoices";
import {
  CheckoutRefused,
  PaymentsNotConfigured,
  invoiceCheckout,
  type CheckoutStart,
} from "@/server/stripe";
import type { FormState, PayState } from "./auth";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh(form: FormData) {
  revalidatePath(`/jobs/${text(form, "job")}`);
  revalidatePath("/invoices");
}

function done(form: FormData, message: string): FormState {
  refresh(form);
  return { message };
}

// ---------------------------------------------------------------------------
// Office: drafts
// ---------------------------------------------------------------------------

export async function createInvoiceAction(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  try {
    await createInvoice(await createClient(), text(form, "job"));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  return done(form, "Invoice drafted. Check it, then send it.");
}

export async function addInvoiceLine(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const description = text(form, "description");
  const quantity = parseQuantity(text(form, "quantity"));
  const price = parseDollars(text(form, "price"));
  const fields: Record<string, string> = {};
  const described = lineDescriptionError(description);
  if (described) fields.description = described;
  if (quantity === null) fields.quantity = "Enter a quantity like 1 or 2.5.";
  if (price === null || price < 0) fields.price = "Enter a price like 125.";
  if (Object.keys(fields).length) return { fields };
  const supabase = await createClient();
  const { error } = await supabase.from("invoice_line_item").insert({
    company_id: office.company.id,
    invoice_id: text(form, "invoice"),
    description,
    quantity,
    unit_price_cents: price,
    taxable: form.get("taxable") === "on",
    sort_order: Number(text(form, "sort") || "0"),
  });
  if (error) return { error: friendlyDbError(error.message) };
  return done(form, "Line added.");
}

export async function removeInvoiceLine(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const { error } = await (
    await createClient()
  )
    .from("invoice_line_item")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", text(form, "line"))
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  return done(form, "Line removed.");
}

export async function saveInvoiceDetails(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const discount = text(form, "discount") ? parseDollars(text(form, "discount")) : 0;
  if (discount === null || discount < 0)
    return { fields: { discount: "Enter an amount like 50, or leave it empty." } };
  const due = text(form, "due_date");
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { fields: { due_date: "Pick a date." } };
  const supabase = await createClient();
  // The items' subtotal, as the database totals it (deposit credits aren't discounted).
  const { data: lines } = await supabase
    .from("invoice_line_item")
    .select("kind, quantity, unit_price_cents")
    .eq("invoice_id", text(form, "invoice"))
    .is("deleted_at", null);
  const subtotal = ((lines ?? []) as { kind: string; quantity: number; unit_price_cents: number }[])
    .filter((l) => l.kind === "item")
    .reduce(
      (sum, l) => sum + Math.round((Math.round(l.quantity * 100) * l.unit_price_cents) / 100),
      0,
    );
  const tooLarge = discountTooLarge(discount, subtotal);
  if (tooLarge) return { fields: { discount: tooLarge } };
  const { error } = await supabase
    .from("invoice")
    .update({ discount_cents: discount, due_date: due || null, notes: text(form, "notes") || null })
    .eq("id", text(form, "invoice"))
    .eq("company_id", office.company.id);
  if (error) return { error: friendlyDbError(error.message) };
  return done(form, "Saved.");
}

// ---------------------------------------------------------------------------
// Office: sending, payments, void
// ---------------------------------------------------------------------------

export interface SendInvoiceState extends FormState {
  link?: string;
}

export async function sendInvoiceAction(
  _: SendInvoiceState,
  form: FormData,
): Promise<SendInvoiceState> {
  await getOffice();
  const channel = text(form, "channel") === "email" ? "email" : "link";
  try {
    const r = await sendInvoice(await createClient(), text(form, "invoice"), {
      channel,
      to: text(form, "to") || null,
      origin: await siteOrigin(),
    });
    refresh(form);
    return {
      message: r.emailed
        ? `Sent to ${text(form, "to")}${r.reportLink ? ", with the month’s service report" : ""}.`
        : r.reportLink
          ? "Invoice sent with the month’s service report. Copy the link for the customer; the invoice page links the report."
          : "Invoice sent. Copy the link for the customer.",
      link: r.link,
    };
  } catch (e) {
    if (e instanceof EmailNotConfigured) return { error: e.message };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export interface RecordPaymentState extends FormState {
  /** The payment just recorded and the invoice's status after it, for Send Receipt. */
  recorded?: { paymentId: string; status: string };
}

/**
 * Anyone on the team, techs too (owner, 2026-10-22; the database holds a tech to the jobs they
 * can see): cash, a check (with its number), or another payment outside Stripe. The office then
 * offers Send Receipt (2026-10-22), so nothing is emailed by itself.
 */
export async function recordPaymentAction(
  _: RecordPaymentState,
  form: FormData,
): Promise<RecordPaymentState> {
  await getOffice();
  const amount = parseDollars(text(form, "amount"));
  if (amount === null || amount <= 0) return { fields: { amount: "Enter an amount like 649." } };
  const method = ["cash", "check", "other"].includes(text(form, "method"))
    ? text(form, "method")
    : "other";
  const checkNumber = method === "check" ? text(form, "check_number") : "";
  const bad = checkNumberError(checkNumber);
  if (bad) return { fields: { check_number: bad } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    target_invoice: text(form, "invoice"),
    amount,
    method,
    check_number: checkNumber || null,
  });
  if (error) return { fields: { amount: friendlyDbError(error.message) } };
  const r = data as { status: string; paid_now: boolean; payment_id: string };
  refresh(form);
  return {
    message: r.status === "paid" ? "Paid in full." : "Payment recorded.",
    recorded: { paymentId: r.payment_id, status: r.status },
  };
}

/** Send Receipt: the receipt for a payment (the latest when none is named), by email or text. */
export async function sendReceiptAction(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const channel: ReceiptChannel = text(form, "channel") === "text" ? "text" : "email";
  try {
    await sendPaymentReceipt(await createClient(), office.user.id, text(form, "invoice"), {
      channel,
      to: text(form, "to"),
      paymentId: text(form, "payment") || null,
      origin: await siteOrigin(),
    });
  } catch (e) {
    if (e instanceof EmailNotConfigured) return { fields: { to: e.message } };
    return { fields: { to: e instanceof Error ? e.message : String(e) } };
  }
  refresh(form);
  return { message: receiptSentMessage(channel, text(form, "to")) };
}

export async function voidInvoiceAction(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  const { error } = await (
    await createClient()
  ).rpc("void_invoice", {
    target_invoice: text(form, "invoice"),
  });
  if (error) return { error: error.message };
  return done(form, "Invoice voided.");
}

/** Owners: one draft invoice per customer for a month's finished maintenance visits. */
export async function billMaintenanceMonth(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const month = text(form, "month");
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { error: "Pick a month." };
  const { data, error } = await (
    await createClient()
  ).rpc("create_monthly_invoices", { target_company: office.company.id, month });
  if (error) return { error: error.message };
  revalidatePath("/invoices");
  const n = Number(data ?? 0);
  return {
    message: n === 1 ? "1 draft invoice ready to review." : `${n} draft invoices ready to review.`,
  };
}

// ---------------------------------------------------------------------------
// Customer invoice page (/i/{token}): no sign-in
// ---------------------------------------------------------------------------

export async function payInvoice(_: PayState, form: FormData): Promise<PayState> {
  const token = text(form, "token");
  let start: CheckoutStart;
  try {
    // With the shop's card fee on, the customer chose card or bank (owner, 2026-10-19).
    const method = text(form, "method");
    start = await invoiceCheckout(
      token,
      await siteOrigin(),
      undefined,
      undefined,
      undefined,
      method === "card" || method === "bank" ? method : null,
    );
  } catch (e) {
    if (e instanceof CheckoutRefused || e instanceof PaymentsNotConfigured)
      return { error: e.message };
    return { error: "Couldn’t start the payment. Please try again in a moment." };
  }
  // Embedded: the page shows Stripe's form in place. Otherwise, off to Stripe's page.
  if (start.kind === "embedded") return { checkout: start };
  redirect(start.url);
}
