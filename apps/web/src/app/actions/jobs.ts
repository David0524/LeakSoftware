"use server";

import { adminClient } from "@/server/admin";
import { notifyJobChanged } from "@/server/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseDollars,
  REPAIR_ITEM_KEY,
  seesAllJobs,
  planComponents,
  splitEmails,
  validateNewJob,
  zonedTimeToIso,
  type CompanySettings,
  type ComponentType,
  type JobStatus,
  type JobType,
  type NewJobInput,
  intakeQuestionsFor,
  parseGallons,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { getCompany, mayMakeJobs } from "@/lib/data";
import { parsePlanRepeat } from "@/lib/plan-repeat";
import { createClient } from "@/lib/supabase/server";
import { locateProperty } from "@/server/route-days";
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
  if (
    !seesAllJobs(office.company.role, (await getCompany(office)).settings) &&
    text(form, "tech") !== office.user.id
  )
    return {
      error: "You can schedule only your own jobs. Ask an owner to give it to someone else.",
    };
  const start = zonedTimeToIso(date, time, office.company.timezone);
  const end = new Date(new Date(start).getTime() + hours * 3_600_000).toISOString();
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("job")
    .select("status, scheduled_start, assigned_user_id")
    .eq("id", id)
    .maybeSingle();
  const before = job as {
    status: JobStatus;
    scheduled_start: string | null;
    assigned_user_id: string | null;
  } | null;
  const status = before?.status;
  const { error } = await supabase
    .from("job")
    .update({
      assigned_user_id: text(form, "tech") || null,
      scheduled_start: start,
      scheduled_end: end,
      arrival_fixed: form.get("fixed") === "on",
      ...(status === "unscheduled" ? { status: "scheduled" } : {}),
    })
    .eq("id", id)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/schedule");
  revalidatePath("/today");
  // The tech hears about it: a new stop, or a stop moved (owner, 2026-10-19).
  const admin = adminClient();
  if (
    admin &&
    (before?.scheduled_start !== start || before?.assigned_user_id !== (text(form, "tech") || null))
  )
    await notifyJobChanged(admin, {
      jobId: id,
      moved: !!before?.scheduled_start && before.assigned_user_id === (text(form, "tech") || null),
      by: office.user.id,
      timeZone: office.company.timezone,
    });
  return { message: "Scheduled." };
}

const CUSTOMER_KINDS = [
  "homeowner",
  "pool_company",
  "builder",
  "insurer",
  "property_manager",
  "other",
] as const;
const POOL_TYPES = ["gunite_plaster", "vinyl", "fiberglass", "other"] as const;

/** Office: a customer's name, contact details, the other emails that get reports, and notes. */
export async function saveCustomer(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const id = text(form, "customer");
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter the customer’s name." } };
  const kind = text(form, "kind");
  if (!(CUSTOMER_KINDS as readonly string[]).includes(kind))
    return { fields: { kind: "Pick one." } };
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
      name,
      kind,
      company_name: text(form, "company_name") || null,
      phone: text(form, "phone") || null,
      email: email || null,
      cc_emails: cc,
      notes: text(form, "notes") || null,
      marketing_opt_out: form.get("no_followups") === "on",
    })
    .eq("id", id)
    .eq("company_id", office.company.id);
  if (error) return { error: error.message };
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  return { message: "Saved." };
}

/**
 * Office: a pool's address and details. A new address drops the old map location (it belonged
 * to the old address) and looks the new one up when routing is set up.
 */
export async function savePool(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const id = text(form, "property");
  const line1 = text(form, "address_line1");
  if (!line1) return { fields: { address_line1: "Enter the street address." } };
  const poolType = text(form, "pool_type");
  if (poolType && !(POOL_TYPES as readonly string[]).includes(poolType))
    return { fields: { pool_type: "Pick one." } };
  // Gallons as typed ("20,000", "20000"); blank clears it (owner, 2026-10-19).
  const gallonsText = text(form, "approx_gallons").replace(/[,\s]/g, "");
  const gallons = gallonsText ? Math.round(Number(gallonsText)) : null;
  if (gallons !== null && !(Number.isFinite(gallons) && gallons > 0 && gallons < 10_000_000))
    return { fields: { approx_gallons: "Enter the gallons as a number, like 20,000." } };
  const address = {
    address_line1: line1,
    address_line2: text(form, "address_line2") || null,
    city: text(form, "city") || null,
    state: text(form, "state").toUpperCase() || null,
    postal_code: text(form, "postal_code") || null,
  };
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("property")
    .select("customer_id, address_line1, address_line2, city, state, postal_code")
    .eq("id", id)
    .eq("company_id", office.company.id)
    .maybeSingle();
  if (!before) return { error: "This pool is gone. Refresh the page." };
  const moved = (Object.keys(address) as (keyof typeof address)[]).some(
    (k) => (before[k] ?? null) !== address[k],
  );
  const { error } = await supabase
    .from("property")
    .update({
      ...address,
      pool_type: poolType || null,
      has_spa: form.get("has_spa") === "on",
      approx_gallons: gallons,
      access_notes: text(form, "access_notes") || null,
      ...(moved
        ? { latitude: null, longitude: null, geocoded_address: null, location_source: null }
        : {}),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  if (moved) await locateProperty(office, id);
  revalidatePath(`/customers/${before.customer_id}`);
  revalidatePath("/jobs", "layout");
  revalidatePath("/schedule");
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
  if (!(await mayMakeJobs(office))) return { error: "Only owners can make new jobs." };
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
  // A tech who sees only their own jobs books them for themselves.
  if (
    !seesAllJobs(office.company.role, (await getCompany(office)).settings) &&
    tech !== office.user.id
  )
    fields.tech = "Book the job for yourself.";
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
  const newCustomer = customerId
    ? null
    : {
        name: input.customerName,
        phone: input.customerPhone || null,
        email: input.customerEmail || null,
        cc_emails: splitEmails(text(form, "cc_emails")),
      };
  const newProperty = propertyId
    ? null
    : {
        address_line1: input.addressLine1,
        city: input.city || null,
        state: input.state.toUpperCase() || null,
        postal_code: input.postalCode || null,
        pool_type: pool.pool_type,
        has_spa: pool.has_spa,
        access_notes: text(form, "access_notes") || null,
      };

  // The create functions don't take a shape; a new pool gets it right after, when one was
  // picked (it can stay blank and be set on the job's Findings).
  const shape = text(form, "diagram_shape");
  // Gallons from From the Customer (owner, 2026-10-19), saved on the pool; blank keeps it.
  const gallons = text(form, "approx_gallons") ? parseGallons(text(form, "approx_gallons")) : null;
  if (text(form, "approx_gallons") && gallons === null)
    return { fields: { approx_gallons: "Enter the gallons as a number, like 20,000." } };
  async function saveShape(property: string) {
    const values = {
      ...(newProperty && shape ? { diagram_shape: shape } : {}),
      ...(gallons ? { approx_gallons: gallons } : {}),
    };
    if (Object.keys(values).length)
      await supabase.from("property").update(values).eq("id", property);
  }

  // Leak detection, a pool inspection, a repair, or maintenance: a single visit, or (owners) a
  // plan that repeats.
  const chosen = text(form, "job_type");
  const kind: JobType =
    chosen === "maintenance" || chosen === "repair" || chosen === "inspection"
      ? chosen
      : "detection";
  const repeat = kind === "maintenance" ? text(form, "repeat") || "0" : "0";
  if (repeat !== "0") {
    if (!office.isManager) return { error: "Only owners can start maintenance plans." };
    const planFields: Record<string, string> = {};
    const first = text(form, "date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) planFields.date = "Pick the first visit's date.";
    const time = text(form, "time");
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) planFields.time = "Pick a time.";
    const minutes = Number(text(form, "minutes"));
    if (!(Number.isInteger(minutes) && minutes >= 10 && minutes <= 240))
      planFields.minutes = "Enter 10 to 240 minutes.";
    const ends = text(form, "ends_on");
    if (ends && ends < first) planFields.ends_on = "End on or after the first visit.";
    const shape = parsePlanRepeat(form);
    if ("field" in shape) planFields[shape.field] = shape.message;
    if (Object.keys(planFields).length || "field" in shape) return { fields: planFields };
    const { data: started, error: planError } = await supabase.rpc("create_service_plan", {
      target_company: office.company.id,
      new_customer: newCustomer,
      existing_customer: customerId ?? null,
      new_property: newProperty,
      existing_property: propertyId ?? null,
      plan: {
        assigned_user_id: tech,
        starts_on: first,
        ...shape.shape,
        visit_time: time || null,
        duration_minutes: minutes,
        price_cents: fee,
        ends_on: ends || null,
        notes: text(form, "notes") || null,
      },
    });
    if (planError) return { error: planError.message };
    const made = started as { customer: string; property: string };
    await locateProperty(office, made.property);
    await saveShape(made.property);
    revalidatePath("/jobs");
    revalidatePath("/schedule");
    revalidatePath("/today");
    redirect(`/customers/${made.customer}`);
  }

  const { data: types } = await supabase
    .from("component_type")
    .select("*")
    .eq("company_id", office.company.id)
    .is("deleted_at", null);
  const components = planComponents(
    (types ?? []) as ComponentType[],
    { has_pool: true, has_spa: pool.has_spa, pool_type: pool.pool_type },
    kind,
  );

  const questions = intakeQuestionsFor(
    ((await getCompany(office)).settings as Partial<CompanySettings>).intake_questions ?? [],
    kind,
  );
  const intake: Record<string, string | string[]> = {};
  for (const q of questions) {
    if (q.type === "multi") {
      const picked = form.getAll(`q_${q.key}`).map(String).filter(Boolean);
      if (picked.length) intake[q.key] = picked;
    } else if (text(form, `q_${q.key}`)) {
      intake[q.key] = text(form, `q_${q.key}`);
    }
  }

  // From the Customer (owner, 2026-10-19): the price book item a repair was booked for.
  const repairItem = kind === "repair" ? text(form, "repair_item") : "";
  if (repairItem) {
    const { data: item } = await supabase
      .from("price_book_item")
      .select("name")
      .eq("id", repairItem)
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (item) intake[REPAIR_ITEM_KEY] = item.name as string;
  }

  const start = scheduled
    ? zonedTimeToIso(input.scheduleDate, input.scheduleTime, office.company.timezone)
    : null;
  const { data, error } = await supabase.rpc("create_job", {
    target_company: office.company.id,
    new_customer: newCustomer,
    existing_customer: customerId ?? null,
    new_property: newProperty,
    existing_property: propertyId ?? null,
    job: {
      type: kind,
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
  // Coordinates for routing, from the address (when the routing service is set up).
  const { data: made } = await supabase
    .from("job")
    .select("property_id")
    .eq("id", data as string)
    .single();
  if (made) {
    await locateProperty(office, (made as { property_id: string }).property_id);
    await saveShape((made as { property_id: string }).property_id);
  }
  if (scheduled && tech) {
    const admin = adminClient();
    if (admin)
      await notifyJobChanged(admin, {
        jobId: data as string,
        moved: false,
        by: office.user.id,
        timeZone: office.company.timezone,
      });
  }
  revalidatePath("/jobs");
  revalidatePath("/schedule");
  redirect(`/jobs/${data as string}`);
}
