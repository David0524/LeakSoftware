"use server";

import { revalidatePath } from "next/cache";
import { CLEANING_MONTHS, isDateString, parseDollars, uuidv7 } from "@leakbook/core";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

// Maintenance plans (owner request, 2026-10-13). Saving, pausing, or ending a plan makes or
// replaces its upcoming visits in the database (app.plan_visits), so these only write the
// plan. Owners only; row security checks again.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refresh(customer: string) {
  revalidatePath(`/customers/${customer}`);
  revalidatePath("/schedule");
  revalidatePath("/today");
  revalidatePath("/jobs");
}

export async function savePlan(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const plan = text(form, "plan");
  const customer = text(form, "customer");
  const property = text(form, "property");
  const fields: Record<string, string> = {};
  const starts = text(form, "starts_on");
  if (!isDateString(starts)) fields.starts_on = "Pick the first visit's date.";
  const every = Number(text(form, "interval_weeks"));
  if (![1, 2, 3, 4].includes(every)) fields.interval_weeks = "Pick how often.";
  const time = text(form, "visit_time");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fields.visit_time = "Pick a time.";
  const minutes = Number(text(form, "duration_minutes"));
  if (!(Number.isInteger(minutes) && minutes >= 10 && minutes <= 240))
    fields.duration_minutes = "Enter 10 to 240 minutes.";
  const priceText = text(form, "price");
  const price = priceText ? parseDollars(priceText) : null;
  if (priceText && (price === null || price < 0)) fields.price = "Enter a price like 95.";
  const ends = text(form, "ends_on");
  if (ends && (!isDateString(ends) || ends < starts)) fields.ends_on = "End on or after the start.";
  const tech = text(form, "tech");
  if (tech && !UUID.test(tech)) fields.tech = "Pick a tech.";
  if (!UUID.test(customer) || !UUID.test(property) || (plan && !UUID.test(plan)))
    return { error: "This pool can't be found. Refresh the page." };

  // Regular cleanings (owner, 2026-10-18): one per checklist item on a schedule, on or off.
  const cleanings: {
    type: string;
    on: boolean;
    every_months: number;
    next_due: string;
    price_cents: number | null;
  }[] = [];
  for (const type of new Set(form.getAll("cleaning_type").map(String))) {
    if (!UUID.test(type)) return { error: "This cleaning can't be found. Refresh the page." };
    const key = `clean_${type}`;
    const on = form.get(key) === "on";
    const months = Number(text(form, `${key}_months`));
    const due = text(form, `${key}_due`);
    const priceText = text(form, `${key}_price`);
    const cents = priceText ? parseDollars(priceText) : null;
    if (on) {
      if (!(CLEANING_MONTHS as readonly number[]).includes(months))
        fields[`${key}_months`] = "Pick how often.";
      if (!isDateString(due)) fields[`${key}_due`] = "Pick when it's next due.";
      if (priceText && (cents === null || cents < 0))
        fields[`${key}_price`] = "Enter a price like 40.";
    }
    cleanings.push({ type, on, every_months: months, next_due: due, price_cents: cents });
  }
  if (Object.keys(fields).length) return { fields };

  const row = {
    assigned_user_id: tech || null,
    starts_on: starts,
    interval_weeks: every,
    visit_time: time || null,
    duration_minutes: minutes,
    price_cents: price,
    ends_on: ends || null,
    notes: text(form, "notes") || null,
  };
  const db = await createClient();
  const company = office.company.id;
  const planId = plan || uuidv7();
  const { error } = plan
    ? await db.from("service_plan").update(row).eq("id", plan).eq("company_id", company)
    : await db.from("service_plan").insert({
        id: planId,
        company_id: company,
        customer_id: customer,
        property_id: property,
        ...row,
      });
  if (error) return { error: error.message };

  // Saving a cleaning puts it on its visit (app.place_cleanings), so the plan goes first.
  const { data: existing, error: readError } = await db
    .from("plan_cleaning")
    .select("id, component_type_id")
    .eq("service_plan_id", planId)
    .eq("company_id", company)
    .is("deleted_at", null);
  if (readError) return { error: readError.message };
  for (const c of cleanings) {
    const had = existing?.find((e) => e.component_type_id === c.type);
    const values = {
      every_months: c.every_months,
      next_due: c.next_due,
      price_cents: c.price_cents,
    };
    const { error: cleaningError } = c.on
      ? had
        ? await db.from("plan_cleaning").update(values).eq("id", had.id).eq("company_id", company)
        : await db.from("plan_cleaning").insert({
            id: uuidv7(),
            company_id: company,
            service_plan_id: planId,
            component_type_id: c.type,
            ...values,
          })
      : had
        ? await db
            .from("plan_cleaning")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", had.id)
            .eq("company_id", company)
        : { error: null };
    if (cleaningError) return { error: cleaningError.message };
  }
  refresh(customer);
  return {
    message: plan
      ? "Plan saved. Upcoming visits updated."
      : "Plan added. Visits are on the schedule.",
  };
}

/** Pause (no visits made; upcoming ones not started are removed) or resume a plan. */
export async function setPlanPaused(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const plan = text(form, "plan");
  const customer = text(form, "customer");
  if (!UUID.test(plan)) return { error: "This plan can't be found. Refresh the page." };
  const paused = text(form, "paused") === "true";
  const { error } = await (
    await createClient()
  )
    .from("service_plan")
    .update({ paused })
    .eq("id", plan)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  refresh(customer);
  return { message: paused ? "Paused. Upcoming visits are off the schedule." : "Resumed." };
}

/** End a plan: its upcoming visits leave the schedule; finished visits are kept. */
export async function endPlan(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const plan = text(form, "plan");
  const customer = text(form, "customer");
  if (!UUID.test(plan)) return { error: "This plan can't be found. Refresh the page." };
  const { error } = await (
    await createClient()
  )
    .from("service_plan")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", plan)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  refresh(customer);
  return { message: "Plan ended." };
}
