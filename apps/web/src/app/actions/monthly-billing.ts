"use server";

import { revalidatePath } from "next/cache";
import { parseDollars, uuidv7, type SendAllResult } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { friendlyDbError, lineDescriptionError } from "@/lib/limits";
import { parseQuantity } from "@/lib/quantity";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { sendMonthInvoices, validMonth } from "@/server/monthly-billing";
import type { FormState } from "./auth";

// Monthly billing (owner, 2026-11-15; docs/design/2026-11-15-monthly-billing.md): a month's
// page (Create Invoices, Add Charge, Remove, Send All) and a visit's Charges.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refreshMonth(month: string) {
  revalidatePath("/invoices");
  if (validMonth(month)) revalidatePath(`/invoices/month/${month}`);
}

const ONLY_MANAGERS = "Only owners and admins can bill the month.";

/** Create Invoices: the month's drafts for everyone not invoiced yet, whatever their day. */
export async function createMonthInvoices(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  const month = text(form, "month");
  if (!validMonth(month)) return { error: "Pick a month." };
  const { data, error } = await (
    await createClient()
  ).rpc("create_monthly_invoices", { target_company: office.company.id, month });
  if (error) return { error: friendlyDbError(error.message) };
  refreshMonth(month);
  const n = Number(data ?? 0);
  return {
    message: n === 1 ? "1 invoice ready to send." : `${n} invoices ready to send.`,
  };
}

export interface SendAllState extends FormState {
  result?: SendAllResult;
}

/** Send All: the month's drafts, each by email or text. */
export async function sendAllAction(_: SendAllState, form: FormData): Promise<SendAllState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  const month = text(form, "month");
  try {
    const result = await sendMonthInvoices(
      await createClient(),
      office.user.id,
      office.company.id,
      month,
      await siteOrigin(),
    );
    refreshMonth(month);
    return { result, message: result.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** The fields Add Charge sends: a price book item, or a custom description and price. */
async function chargeFields(form: FormData): Promise<
  | {
      ok: true;
      name: string;
      quantity: number;
      cents: number;
      taxable: boolean;
      item: string | null;
    }
  | { ok: false; state: FormState }
> {
  const quantity = parseQuantity(text(form, "quantity") || "1");
  if (quantity === null || quantity <= 0)
    return { ok: false, state: { fields: { quantity: "Enter a quantity like 1 or 2.5." } } };
  const itemId = text(form, "item");
  if (text(form, "mode") === "book" && !itemId)
    return { ok: false, state: { fields: { item: "Pick an item from the price book." } } };
  if (itemId) {
    const { data } = await (
      await createClient()
    )
      .from("price_book_item")
      .select("id, name, price_cents, taxable")
      .eq("id", itemId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { ok: false, state: { error: "That item isn’t in the price book anymore." } };
    return {
      ok: true,
      name: data.name as string,
      quantity,
      cents: (data.price_cents as number | null) ?? 0,
      taxable: (data.taxable as boolean | null) ?? true,
      item: data.id as string,
    };
  }
  const name = text(form, "description");
  const price = parseDollars(text(form, "price"));
  const fields: Record<string, string> = {};
  const described = lineDescriptionError(name);
  if (described) fields.description = described;
  if (price === null || price < 0) fields.price = "Enter a price like 24.";
  if (Object.keys(fields).length) return { ok: false, state: { fields } };
  return {
    ok: true,
    name,
    quantity,
    cents: price!,
    taxable: form.get("taxable") === "on",
    item: null,
  };
}

/** Add Charge on a month's page: a line on that customer's draft. */
export async function addMonthCharge(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  const f = await chargeFields(form);
  if (!f.ok) return f.state;
  const supabase = await createClient();
  const invoice = text(form, "invoice");
  const { data: last } = await supabase
    .from("invoice_line_item")
    .select("sort_order")
    .eq("invoice_id", invoice)
    .is("deleted_at", null)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("invoice_line_item").insert({
    company_id: office.company.id,
    invoice_id: invoice,
    description: f.name,
    quantity: f.quantity,
    unit_price_cents: f.cents,
    taxable: f.taxable,
    sort_order: ((last?.sort_order as number | undefined) ?? 0) + 1,
  });
  if (error) return { error: friendlyDbError(error.message) };
  refreshMonth(text(form, "month"));
  return { message: "Charge added." };
}

/** Remove a line from a draft on a month's page. */
export async function removeMonthLine(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  const { error } = await (
    await createClient()
  )
    .from("invoice_line_item")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", text(form, "line"))
    .eq("company_id", office.company.id);
  if (error) return { error: friendlyDbError(error.message) };
  refreshMonth(text(form, "month"));
  return { message: "Line removed." };
}

/** Add Charge on a visit (anyone on the team who can see it). */
export async function addVisitCharge(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const f = await chargeFields(form);
  if (!f.ok) return f.state;
  const job = text(form, "job");
  const { error } = await (await createClient()).from("visit_charge").insert({
    id: uuidv7(),
    company_id: office.company.id,
    job_id: job,
    price_book_item_id: f.item,
    name: f.name,
    quantity: f.quantity,
    unit_price_cents: f.cents,
    taxable: f.taxable,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath(`/jobs/${job}`);
  revalidatePath("/invoices", "layout");
  return { message: "Charge added." };
}

/** Remove a charge from a visit. */
export async function removeVisitCharge(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const { error } = await (
    await createClient()
  )
    .from("visit_charge")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", text(form, "charge"))
    .eq("company_id", office.company.id);
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath(`/jobs/${text(form, "job")}`);
  revalidatePath("/invoices", "layout");
  return { message: "Charge removed." };
}
