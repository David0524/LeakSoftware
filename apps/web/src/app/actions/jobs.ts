"use server";

import { revalidatePath } from "next/cache";
import { splitEmails, zonedTimeToIso, type JobStatus } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
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
    .update({ email: email || null, cc_emails: cc })
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
