"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { isQuoteJob, newQuoteRecords, uuidv7 } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { mayMakeJobs } from "@/lib/data";
import { friendlyDbError } from "@/lib/limits";
import { newQuoteErrors, newQuoteInput } from "@/lib/quotes";
import { isUuid } from "@/lib/uuid";
import { createClient } from "@/lib/supabase/server";
import { locateProperty } from "@/server/route-days";
import type { FormState } from "./auth";

// Standalone quotes (docs/design/2026-11-24-standalone-quotes.md): New Quote, a quote job's
// Add Pool, and Delete Quote. Written as the signed-in member (row security), as the phones
// write them through the sync layer.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const NOT_ALLOWED = "Your office makes new jobs. Ask an owner or admin to add this one.";

/**
 * New Quote: the customer (if new), the pool (if new), the quote job and its empty quote, then
 * the Quote screen in place of New Quote. A step that fails takes back the rows written before
 * it (soft-deleted), so nothing half-made is left.
 */
export async function createQuoteAction(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  if (!(await mayMakeJobs(office))) return { error: NOT_ALLOWED };
  const { input, existing } = newQuoteInput(form);
  const fields = newQuoteErrors(input, existing);
  if (Object.keys(fields).length) return { fields };

  const db = await createClient();
  const company = office.company.id;
  if (input.customerId) {
    const { data } = await db
      .from("customer")
      .select("id")
      .eq("company_id", company)
      .eq("id", input.customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { fields: { customer: "Pick a customer." } };
  }
  if (input.propertyId) {
    const { data } = await db
      .from("property")
      .select("id")
      .eq("company_id", company)
      .eq("id", input.propertyId)
      .eq("customer_id", input.customerId ?? "")
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { fields: { property: "Pick one of the customer's pools." } };
  }

  // The person making it, when they're a tech, so a tech limited to their own jobs sees it.
  const records = newQuoteRecords(input, office.company.role === "tech" ? office.user.id : null);
  const written: { table: string; id: string }[] = [];
  const undo = async () => {
    const at = new Date().toISOString();
    for (const row of written.reverse())
      await db.from(row.table).update({ deleted_at: at }).eq("id", row.id);
  };
  const insert = async (table: string, values: Record<string, unknown>) => {
    const id = uuidv7();
    const { error } = await db.from(table).insert({ id, company_id: company, ...values });
    if (error) throw new Error(friendlyDbError(error.message));
    written.push({ table, id });
    return id;
  };

  let quoteId: string;
  let newPool: string | null = null;
  try {
    const customerId = records.customer
      ? await insert("customer", {
          ...records.customer,
          // OK to Text, asked with the new customer's phone.
          ...(form.get("text_ok") === "on"
            ? { text_ok_at: new Date().toISOString(), text_ok_by: office.user.id }
            : {}),
        })
      : input.customerId!;
    newPool = records.property
      ? await insert("property", { ...records.property, customer_id: customerId })
      : null;
    const business = String(form.get("business") ?? "");
    const jobId = await insert("job", {
      ...records.job,
      // New Quote's Business row (2026-11-26), only when picked.
      ...(business === "main" || business === "second" ? { business } : {}),
      property_id: newPool ?? input.propertyId ?? null,
      bill_to_customer_id: customerId,
    });
    quoteId = await insert("quote", { ...records.quote, job_id: jobId });
  } catch (e) {
    await undo();
    return { error: e instanceof Error ? e.message : "Couldn’t create the quote. Try again." };
  }
  // Coordinates for routing, once it becomes a job (when the routing service is set up).
  if (newPool) await locateProperty(office, newPool).catch(() => {});
  revalidatePath("/quotes");
  if (records.customer) revalidatePath("/customers");
  else revalidatePath(`/customers/${input.customerId}`);
  redirect(`/quotes/${quoteId}`, RedirectType.replace);
}

/**
 * The Quote screen's Add Pool, for a quote job with none: one of the customer's pools or a new
 * address, as the job's pool. Accepted already, it becomes the repair job (the database's
 * a_quote_job_gets_pool).
 */
export async function addQuotePoolAction(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const jobId = text(form, "job");
  const quoteId = text(form, "quote");
  if (!isUuid(jobId)) return { error: "This quote is gone. Refresh the page." };
  const db = await createClient();
  const { data: job } = await db
    .from("job")
    .select("id, status, property_id, bill_to_customer_id")
    .eq("company_id", office.company.id)
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!job || !isQuoteJob(job)) return { error: "This quote is already on a job." };
  if (job.property_id) return { error: "This quote already has a pool. Refresh the page." };
  const customerId = job.bill_to_customer_id as string;

  const choice = text(form, "property") || "new";
  let propertyId: string;
  if (choice !== "new") {
    const { data } = await db
      .from("property")
      .select("id")
      .eq("company_id", office.company.id)
      .eq("id", choice)
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { fields: { property: "Pick one of the customer's pools." } };
    propertyId = choice;
  } else {
    const street = text(form, "address_line1");
    if (!street) return { fields: { address_line1: "Enter the street address." } };
    propertyId = uuidv7();
    const { error } = await db.from("property").insert({
      id: propertyId,
      company_id: office.company.id,
      customer_id: customerId,
      address_line1: street,
      city: text(form, "city") || null,
      state: text(form, "state").toUpperCase() || null,
      postal_code: text(form, "postal_code") || null,
      has_pool: true,
    });
    if (error) return { error: friendlyDbError(error.message) };
    await locateProperty(office, propertyId).catch(() => {});
  }
  const { error } = await db
    .from("job")
    .update({ property_id: propertyId })
    .eq("id", jobId)
    .eq("company_id", office.company.id);
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/quotes");
  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/jobs", "layout");
  revalidatePath("/schedule");
  return { message: "Pool added." };
}

/**
 * Delete Quote: a draft standalone quote and its quote job, soft-deleted. A sent quote, or one
 * on a job, stays.
 */
export async function deleteQuoteAction(
  quoteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const office = await getOffice();
  if (!isUuid(quoteId)) return { ok: false, error: "This quote is gone. Refresh the page." };
  const db = await createClient();
  const { data: quote } = await db
    .from("quote")
    .select("id, job_id, status")
    .eq("company_id", office.company.id)
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!quote) return { ok: false, error: "This quote is gone. Refresh the page." };
  const { data: job } = await db
    .from("job")
    .select("id, status")
    .eq("id", quote.job_id as string)
    .maybeSingle();
  if (quote.status !== "draft" || !job || !isQuoteJob(job))
    return { ok: false, error: "Only a draft quote that isn't on a job can be deleted." };
  const at = new Date().toISOString();
  const first = await db.from("quote").update({ deleted_at: at }).eq("id", quoteId);
  if (first.error) return { ok: false, error: friendlyDbError(first.error.message) };
  const second = await db
    .from("job")
    .update({ deleted_at: at })
    .eq("id", job.id as string);
  if (second.error) {
    await db.from("quote").update({ deleted_at: null }).eq("id", quoteId);
    return { ok: false, error: friendlyDbError(second.error.message) };
  }
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return { ok: true };
}
