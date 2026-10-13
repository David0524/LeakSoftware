"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseDollars,
  planComponents,
  splitEmails,
  validateNewJob,
  zonedTimeToIso,
  type CompanySettings,
  type ComponentType,
  type JobStatus,
  type NewJobInput,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Office: assign and schedule a job (for example, a repair created by an accepted quote). */
export async function scheduleJob(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const id = text(form, "job");
  const date = text(form, "date");
  const time = text(form, "time");
  const hours = Number(text(form, "hours") || "2");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { fields: { date: "Choose a date." } };
  if (!/^\d{2}:\d{2}$/.test(time)) return { fields: { time: "Choose a start time." } };
  if (!(hours > 0 && hours <= 24)) return { fields: { hours: "Enter 0.5 to 24 hours." } };
  const start = zonedTimeToIso(date, time, office.company.timezone);
  const end = new Date(new Date(start).getTime() + hours * 3_600_000).toISOString();
  const supabase = await createClient();
  const { data: job } = await supabase.from("job").select("status").eq("id", id).maybeSingle();
  const status = (job as { status: JobStatus } | null)?.status;
  const { error } = await supabase
    .from("job")
    .update({
      assigned_user_id: text(form, "tech") || null,
      scheduled_start: start,
      scheduled_end: end,
      ...(status === "unscheduled" ? { status: "scheduled" } : {}),
    })
    .eq("id", id)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/schedule");
  return { message: "Scheduled." };
}

/** Office: the customer's email and the other addresses that also get reports (M8.5). */
export async function saveCustomerEmails(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const id = text(form, "customer");
  const email = text(form, "email");
  if (email && !/^\S+@\S+\.\S+$/.test(email))
    return { fields: { email: "Enter an email like name@example.com." } };
  const raw = text(form, "cc_emails");
  const cc = splitEmails(raw);
  if (raw.split(/[\s,;]+/).filter(Boolean).length !== cc.length)
    return { fields: { cc_emails: "One of these isn’t an email address." } };
  const supabase = await createClient();
  const { error } = await supabase
    .from("customer")
    .update({
      email: email || null,
      cc_emails: cc,
      marketing_opt_out: form.get("no_followups") === "on",
    })
    .eq("id", id)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath(`/customers/${id}`);
  return { message: "Saved." };
}

/** Owners: delete a customer with no open work (the database checks). */
export async function deleteCustomer(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  const { error } = await (
    await createClient()
  ).rpc("delete_customer", {
    target_customer: text(form, "customer"),
  });
  if (error) return { error: error.message };
  // No revalidation here: it would re-render this customer's page, now "not found", under
  // the button. The caller (DeleteCustomerForm) goes to the list and refreshes it.
  return { message: "deleted" };
}

/** Office: a new detection job, with a new or existing customer and pool, and its checklist. */
export async function createJobAction(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const supabase = await createClient();
  const existing = text(form, "customer_mode") === "existing";
  const customerId = existing ? text(form, "customer") || undefined : undefined;
  const propertyChoice = existing ? text(form, "property") : "new";
  const propertyId = propertyChoice && propertyChoice !== "new" ? propertyChoice : undefined;
  const scheduled = text(form, "when") === "scheduled";
  const input: NewJobInput = {
    customerId,
    customerName: text(form, "customer_name"),
    customerPhone: text(form, "customer_phone"),
    customerEmail: text(form, "customer_email"),
    propertyId,
    addressLine1: text(form, "address_line1"),
    city: text(form, "city"),
    state: text(form, "state"),
    postalCode: text(form, "postal_code"),
    scheduleDate: scheduled ? text(form, "date") : "",
    scheduleTime: scheduled ? text(form, "time") : "",
  };
  // The shared validator's names, mapped to this form's inputs.
  const FIELD: Record<string, string> = {
    customerName: "customer_name",
    customerEmail: "customer_email",
    addressLine1: "address_line1",
    scheduleDate: "date",
    scheduleTime: "time",
  };
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(validateNewJob(input))) if (v) fields[FIELD[k] ?? k] = v;
  if (existing && !customerId) fields.customer = "Pick a customer.";
  if (scheduled && !input.scheduleDate) fields.date = "Pick a date.";
  const hours = Number(text(form, "hours") || "2");
  if (scheduled && !(hours > 0 && hours <= 24)) fields.hours = "Enter 0.5 to 24 hours.";
  const tech = text(form, "tech") || null;
  const second = text(form, "second_tech") || null;
  if (second && second === tech) fields.second_tech = "Pick someone other than the main tech.";
  const feeText = text(form, "fee");
  const fee = feeText ? parseDollars(feeText) : null;
  if (feeText && (fee === null || fee < 0)) fields.fee = "Enter a price like 649.";
  if (Object.keys(fields).length) return { fields };

  // The pool decides the checklist (spa items, vinyl checks).
  let pool: { has_spa: boolean; pool_type: string | null };
  if (propertyId) {
    const { data } = await supabase
      .from("property")
      .select("has_spa, pool_type")
      .eq("id", propertyId)
      .single();
    if (!data) return { fields: { property: "Pick a pool." } };
    pool = data as typeof pool;
  } else {
    pool = { has_spa: form.get("has_spa") === "on", pool_type: text(form, "pool_type") || null };
  }
  const { data: types } = await supabase
    .from("component_type")
    .select("*")
    .eq("company_id", office.company.id)
    .is("deleted_at", null);
  const components = planComponents((types ?? []) as ComponentType[], {
    has_pool: true,
    has_spa: pool.has_spa,
    pool_type: pool.pool_type,
  });

  const questions =
    ((await getCompany(office)).settings as Partial<CompanySettings>).intake_questions ?? [];
  const intake: Record<string, string | string[]> = {};
  for (const q of questions) {
    if (q.type === "multi") {
      const picked = form.getAll(`q_${q.key}`).map(String).filter(Boolean);
      if (picked.length) intake[q.key] = picked;
    } else if (text(form, `q_${q.key}`)) {
      intake[q.key] = text(form, `q_${q.key}`);
    }
  }

  const start = scheduled
    ? zonedTimeToIso(input.scheduleDate, input.scheduleTime, office.company.timezone)
    : null;
  const { data, error } = await supabase.rpc("create_job", {
    target_company: office.company.id,
    new_customer: customerId
      ? null
      : {
          name: input.customerName,
          phone: input.customerPhone || null,
          email: input.customerEmail || null,
          cc_emails: splitEmails(text(form, "cc_emails")),
        },
    existing_customer: customerId ?? null,
    new_property: propertyId
      ? null
      : {
          address_line1: input.addressLine1,
          city: input.city || null,
          state: input.state.toUpperCase() || null,
          postal_code: input.postalCode || null,
          pool_type: pool.pool_type,
          has_spa: pool.has_spa,
          access_notes: text(form, "access_notes") || null,
        },
    existing_property: propertyId ?? null,
    job: {
      status: scheduled ? "scheduled" : "unscheduled",
      scheduled_start: start,
      scheduled_end: start
        ? new Date(new Date(start).getTime() + hours * 3_600_000).toISOString()
        : null,
      assigned_user_id: tech,
      second_tech_id: second,
      fee_cents: fee,
      intake: Object.keys(intake).length ? intake : null,
      summary_notes: text(form, "notes") || null,
    },
    components,
  });
  if (error) return { error: error.message };
  revalidatePath("/jobs");
  revalidatePath("/schedule");
  redirect(`/jobs/${data as string}`);
}
