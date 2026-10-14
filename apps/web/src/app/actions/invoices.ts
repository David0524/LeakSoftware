"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseDollars } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { EmailNotConfigured } from "@/server/email";
import { createInvoice, sendInvoice, sendReceipt } from "@/server/invoices";
import { CheckoutRefused, PaymentsNotConfigured, invoiceCheckoutUrl } from "@/server/stripe";
import type { FormState } from "./auth";

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
  const quantity = Number(text(form, "quantity") || "1");
  const price = parseDollars(text(form, "price"));
  const fields: Record<string, string> = {};
  if (!description) fields.description = "Describe the work.";
  if (!(quantity > 0) || Math.round(quantity * 100) !== quantity * 100)
    fields.quantity = "Enter a quantity like 1 or 2.5.";
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
  if (error) return { error: error.message };
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
  const { error } = await (
    await createClient()
  )
    .from("invoice")
    .update({ discount_cents: discount, due_date: due || null, notes: text(form, "notes") || null })
    .eq("id", text(form, "invoice"))
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
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
        ? `Sent to ${text(form, "to")}.`
        : "Invoice sent. Copy the link for the customer.",
      link: r.link,
    };
  } catch (e) {
    if (e instanceof EmailNotConfigured) return { error: e.message };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Owners: a check, cash, or other payment outside Stripe. Emails the receipt when paid. */
export async function recordPaymentAction(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  const amount = parseDollars(text(form, "amount"));
  if (amount === null || amount <= 0) return { fields: { amount: "Enter an amount like 649." } };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    target_invoice: text(form, "invoice"),
    amount,
  });
  if (error) return { fields: { amount: error.message } };
  const r = data as { status: string; paid_now: boolean };
  let receipt = false;
  if (r.paid_now) receipt = await sendReceipt(text(form, "invoice"), await siteOrigin(), supabase);
  return done(
    form,
    r.status === "paid"
      ? `Paid in full.${receipt ? " Receipt emailed." : ""}`
      : "Payment recorded.",
  );
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

export async function payInvoice(_: FormState, form: FormData): Promise<FormState> {
  const token = text(form, "token");
  let url: string;
  try {
    url = await invoiceCheckoutUrl(token, await siteOrigin());
  } catch (e) {
    if (e instanceof CheckoutRefused || e instanceof PaymentsNotConfigured)
      return { error: e.message };
    return { error: "Couldn’t start the payment. Please try again in a moment." };
  }
  redirect(url);
}
