"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  configKey,
  isHexColor,
  parseDollars,
  parseFieldLines,
  parseReminderDays,
  percentToBps,
  CARD_FEE_MAX_BPS,
  uuidv7,
  type TestFieldSchema,
} from "@leakbook/core";
import { OWNER_ONLY, requireManager, requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logPriceSyncError, syncSubscriptionPrice } from "@/server/billing";
import { locateCompany } from "@/server/route-days";
import type { FormState } from "./auth";

// Owner-only settings changes. Every action checks the role itself (pages hide the forms,
// but actions are callable directly), and RLS checks it again in the database.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => text(f, k) || null;
const checked = (f: FormData, k: string) => f.get(k) === "on";
const int = (f: FormData, k: string, fallback = 0) => {
  const n = Number.parseInt(text(f, k), 10);
  return Number.isFinite(n) ? n : fallback;
};

/** Owners and admins (settings shared by both). */
async function owner() {
  const office = await requireManager();
  return { office, supabase: await createClient() };
}

/** The roles a person may be given. Only owners make someone an owner or admin. */
function chosenRole(form: FormData): "owner" | "admin" | "tech" {
  const role = text(form, "role");
  return role === "owner" || role === "admin" ? role : "tech";
}

function done(path: string, message = "Saved."): FormState {
  revalidatePath(path);
  return { message };
}

function failed(error: { message: string } | null, fallback = "Couldn’t save. Try again.") {
  return { error: error?.message ?? fallback };
}

// ---------------------------------------------------------------------------
// Company profile, branding, payments
// ---------------------------------------------------------------------------

export async function saveCompany(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter the company name." } };
  const timezone = text(form, "timezone");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC")
    return { fields: { timezone: "Pick a time zone." } };
  const { error } = await supabase
    .from("company")
    .update({
      name,
      legal_name: optional(form, "legal_name"),
      phone: optional(form, "phone"),
      email: optional(form, "email"),
      address_line1: optional(form, "address_line1"),
      address_line2: optional(form, "address_line2"),
      city: optional(form, "city"),
      state: optional(form, "state"),
      postal_code: optional(form, "postal_code"),
      review_url: optional(form, "review_url"),
      timezone,
    })
    .eq("id", office.company.id);
  if (error) return failed(error);
  // Every route starts at the shop: find its coordinates when the address changed.
  await locateCompany(office);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/** Reminder emails and review requests (M10). Sent once a day by the server. */
export async function saveFollowups(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const quoteDays = parseReminderDays(text(form, "quote_days"));
  const invoiceDays = parseReminderDays(text(form, "invoice_days"));
  const fields: Record<string, string> = {};
  if (!quoteDays) fields.quote_days = "Enter days after sending, like 3, 7.";
  if (!invoiceDays) fields.invoice_days = "Enter days after sending, like 7, 14, 30.";
  if (Object.keys(fields).length) return { fields };
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = {
    ...((company?.settings ?? {}) as Record<string, unknown>),
    reminders: { quote_days: quoteDays, invoice_days: invoiceDays },
    review_requests: checked(form, "review_requests"),
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  return done("/settings/company");
}

/** The shop's own legal text, printed at the end of every report (M8.5). */
export async function saveReportText(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const disclaimer = text(form, "report_disclaimer");
  if (disclaimer.length > 20_000)
    return { fields: { report_disclaimer: "Keep it under 20,000 characters." } };
  const { error } = await supabase
    .from("company")
    .update({ report_disclaimer: disclaimer || null })
    .eq("id", office.company.id);
  if (error) return failed(error);
  return done("/settings/company");
}

/** Continue job numbers from the shop's old system. Numbers only go up. */
export async function saveNextJobNumber(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const next = Number(text(form, "next_job_number"));
  if (!Number.isInteger(next) || next < 1 || next > 2_000_000_000)
    return { fields: { next_job_number: "Enter a whole number, like 10450." } };
  const { error } = await supabase.rpc("set_next_job_number", {
    target_company: office.company.id,
    next_number: next,
  });
  if (error) return { fields: { next_job_number: error.message } };
  return done("/settings/company", `The next job will be #${next}.`);
}

export async function saveBranding(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const primary = text(form, "brand_primary");
  const secondary = text(form, "brand_secondary");
  if (!isHexColor(primary)) return { fields: { brand_primary: "Use a color like #12263A." } };
  if (secondary && !isHexColor(secondary))
    return { fields: { brand_secondary: "Use a color like #EE6A1F." } };

  const update: Record<string, string | null> = {
    brand_primary: primary.toUpperCase(),
    brand_secondary: secondary ? secondary.toUpperCase() : null,
  };
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" }[logo.type];
    if (!ext) return { fields: { logo: "Use a PNG, JPEG, or SVG file." } };
    if (logo.size > 2 * 1024 * 1024) return { fields: { logo: "Use a file under 2 MB." } };
    // A new name each time, so reports already sent keep pointing at the old logo.
    const path = `${office.company.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("company-assets")
      .upload(path, logo, { contentType: logo.type, upsert: false });
    if (error) return failed(error);
    update.logo_path = path;
  }
  const { error } = await supabase.from("company").update(update).eq("id", office.company.id);
  if (error) return failed(error);
  return done("/settings/company");
}

export async function savePayments(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const { data: company, error: readError } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  if (readError) return failed(readError);

  const fields: Record<string, string> = {};
  const depositType = text(form, "deposit_type") === "fixed" ? "fixed" : "percent";
  const depositPercent = percentToBps(text(form, "deposit_percent") || "0");
  const depositFixed = parseDollars(text(form, "deposit_fixed") || "0");
  const minimum = parseDollars(text(form, "deposit_minimum") || "0");
  const tax = percentToBps(text(form, "tax_rate") || "0");
  const discount = percentToBps(text(form, "tech_discount_limit") || "0");
  if (depositType === "percent" && depositPercent === null)
    fields.deposit_percent = "Enter a percentage from 0 to 100.";
  if (depositType === "fixed" && (depositFixed === null || depositFixed < 0))
    fields.deposit_fixed = "Enter a dollar amount.";
  if (minimum === null || minimum < 0) fields.deposit_minimum = "Enter a dollar amount.";
  if (tax === null) fields.tax_rate = "Enter a percentage, like 8.6.";
  if (discount === null) fields.tech_discount_limit = "Enter a percentage from 0 to 100.";
  if (Object.keys(fields).length) return { fields };

  const settings = {
    ...(company.settings as Record<string, unknown>),
    deposit:
      depositType === "percent"
        ? { type: "percent", value_bps: depositPercent, minimum_cents: minimum }
        : { type: "fixed", value_cents: depositFixed, minimum_cents: minimum },
    tax_rate_bps: tax,
    tech_discount_limit_bps: discount,
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  return done("/settings/payments");
}

/**
 * Pass the card fee on to customers (owner, 2026-10-19), up to the 3% card networks allow.
 * Off: 0. Customers then choose card (fee added) or bank (no fee) before paying.
 */
export async function saveCardFee(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const on = checked(form, "card_fee_on");
  const bps = percentToBps(text(form, "card_fee") || "0");
  if (on && (bps === null || bps <= 0 || bps > CARD_FEE_MAX_BPS))
    return { fields: { card_fee: "Enter a percentage up to 3, like 2.9." } };
  const { data: company, error: readError } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  if (readError) return failed(readError);
  const settings = {
    ...(company.settings as Record<string, unknown>),
    card_fee_bps: on ? bps : 0,
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  return done("/settings/payments");
}

// ---------------------------------------------------------------------------
// Team and invites
// ---------------------------------------------------------------------------

export async function inviteMember(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const email = text(form, "email").toLowerCase();
  const role = chosenRole(form);
  if (role !== "tech" && !office.isOwner) return { error: OWNER_ONLY };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { fields: { email: "Enter a valid email." } };
  const { error } = await supabase.rpc("create_invite", {
    target_company: office.company.id,
    invite_email: email,
    invite_role: role,
  });
  if (error) return failed(error);
  return done("/settings/team", `Invite created for ${email}. Copy the link below and send it.`);
}

export async function revokeInvite(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await owner();
  const { error } = await supabase.rpc("revoke_invite", { invite_id: text(form, "id") });
  if (error) return failed(error);
  return done("/settings/team", "Invite revoked.");
}

/** Owners: what the shop does, pool care, leak detection, or both (owner, 2026-10-16). */
export async function saveServices(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const choice = text(form, "services");
  if (choice !== "pool" && choice !== "leak" && choice !== "both")
    return { error: "Pick what your shop does." };
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = { ...((company?.settings ?? {}) as Record<string, unknown>), services: choice };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  // A package taken on brings its checklist, tests, and price book (once; nothing is removed).
  const { error: setup } = await supabase.rpc("add_package_defaults", {
    target_company: office.company.id,
    services: choice,
  });
  if (setup) return failed(setup);
  // The package sets the Sundeck Pro price.
  after(() => syncSubscriptionPrice(office.company.id).catch(logPriceSyncError));
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/** Owners: where On My Way texts go out from (owner, 2026-10-16). */
export async function saveOnMyWay(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const choice = text(form, "on_my_way");
  if (choice !== "messages" && choice !== "phone")
    return { error: "Pick where On My Way texts go out from." };
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = { ...((company?.settings ?? {}) as Record<string, unknown>), on_my_way: choice };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/**
 * Owners: techs see every job, or only their own (owner request, 2026-10-13), and whether they
 * can make new jobs (2026-10-18).
 */
export async function saveJobVisibility(_: FormState, form: FormData): Promise<FormState> {
  // A shop security setting: owners only (owner, 2026-10-18).
  const office = await requireOwner();
  const supabase = await createClient();
  const choice = text(form, "techs_see");
  if (choice !== "all" && choice !== "own") return { error: "Pick who techs see." };
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = {
    ...((company?.settings ?? {}) as Record<string, unknown>),
    techs_see_all_jobs: choice === "all",
    techs_make_jobs: checked(form, "techs_make_jobs"),
    require_finish_photo: checked(form, "require_finish_photo"),
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

export async function updateMember(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const status = text(form, "status") === "disabled" ? "disabled" : "active";
  // Only owners change roles (the database refuses it for anyone else too); admins can turn
  // techs and admins off and on.
  const update = office.isOwner ? { role: chosenRole(form), status } : { status };
  const { error } = await supabase
    .from("membership")
    .update(update)
    .eq("company_id", office.company.id)
    .eq("id", text(form, "id"));
  if (error)
    return {
      error: error.message.includes("at least one")
        ? "The shop needs at least one active owner."
        : error.message.includes("Only the shop owner")
          ? OWNER_ONLY
          : error.message,
    };
  // Turning a teammate off or on changes the people billed.
  after(() => syncSubscriptionPrice(office.company.id).catch(logPriceSyncError));
  return done("/settings/team");
}

// ---------------------------------------------------------------------------
// Configuration rows (soft delete only, so phones see the change)
// ---------------------------------------------------------------------------

const ARCHIVABLE = new Set([
  "price_book_item",
  "component_type",
  "test_type",
  "exclusion_reason",
  "severity_level",
]);

export async function removeConfigRow(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const table = text(form, "table");
  if (!ARCHIVABLE.has(table)) return { error: "That can’t be removed." };
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq("company_id", office.company.id)
    .eq("id", text(form, "id"));
  if (error) return failed(error);
  return done(text(form, "path") || "/settings", "Removed.");
}

async function upsert(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  companyId: string,
  id: string,
  values: Record<string, unknown>,
  insertOnly: Record<string, unknown> = {},
) {
  if (id) {
    return supabase.from(table).update(values).eq("company_id", companyId).eq("id", id);
  }
  return supabase
    .from(table)
    .insert({ id: uuidv7(), company_id: companyId, ...insertOnly, ...values });
}

async function takenKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  companyId: string,
) {
  const { data } = await supabase
    .from(table)
    .select("key")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  return (data ?? []).map((r: { key: string }) => r.key);
}

export async function savePriceItem(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const name = text(form, "name");
  const price = parseDollars(text(form, "price"));
  const fields: Record<string, string> = {};
  if (!name) fields.name = "Enter a name.";
  if (price === null || price < 0) fields.price = "Enter a price, like 185 or 185.50.";
  if (Object.keys(fields).length) return { fields };
  const { error } = await upsert(supabase, "price_book_item", office.company.id, text(form, "id"), {
    name,
    description: optional(form, "description"),
    category: optional(form, "category"),
    component_type_key: optional(form, "component_type_key"),
    unit: text(form, "unit") || "each",
    price_cents: price,
    taxable: checked(form, "taxable"),
    sort_order: int(form, "sort_order"),
    active: text(form, "id") ? checked(form, "active") : true,
    on_repair_call: checked(form, "on_repair_call"),
  });
  if (error) return failed(error);
  return done("/settings/price-book", text(form, "id") ? "Saved." : `Added ${name}.`);
}

export async function saveComponentType(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const id = text(form, "id");
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter a name." } };
  const count = int(form, "default_count", 1);
  if (count < 0 || count > 50) return { fields: { default_count: "Use 0 to 50." } };
  const appliesTo = ["pool", "spa", "both"].includes(text(form, "applies_to"))
    ? text(form, "applies_to")
    : "pool";
  // Pool visit items are tasks (Done, Needs Attention, Skipped) in the Service section; leak
  // inspection items take a verdict in the section the owner picks (owner, 2026-10-16: an
  // item a pool shop added used to land on the leak checklist).
  const visit = text(form, "job_type") === "maintenance";
  const section = ["visual", "plumbing", "bond_beam", "other"].includes(text(form, "section"))
    ? text(form, "section")
    : "plumbing";
  const methods = text(form, "methods")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const values = {
    name,
    allows_multiple: visit ? false : checked(form, "allows_multiple"),
    default_count: visit ? 1 : count,
    applies_to: appliesTo,
    methods: visit ? ["Service"] : methods,
    sort_order: int(form, "sort_order"),
    active: id ? checked(form, "active") : true,
    // Pool visit items done every few months, set per plan (owner, 2026-10-18).
    on_schedule: visit && checked(form, "on_schedule"),
    ...(visit ? {} : { section }),
  };
  const { error } = await upsert(
    supabase,
    "component_type",
    office.company.id,
    id,
    values,
    id
      ? {}
      : {
          key: configKey(name, await takenKeys(supabase, "component_type", office.company.id)),
          job_type: visit ? "maintenance" : "detection",
          section: visit ? "service" : section,
          answer: visit ? "done" : "leak",
        },
  );
  if (error) return failed(error);
  return done("/settings/components", id ? "Saved." : `Added ${name}.`);
}

/** Thresholds for built-in calculators, and fields for custom test types. */
export async function saveTestType(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const id = text(form, "id");
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter a name." } };
  const outcomes = ["pass", "fail", "inconclusive"].filter((o) => checked(form, `outcome_${o}`));
  if (outcomes.length < 2) return { error: "Offer at least two outcomes." };

  const values: Record<string, unknown> = {
    name,
    result_options: outcomes,
    sort_order: int(form, "sort_order"),
    active: id ? checked(form, "active") : true,
  };

  let current: {
    field_schema: TestFieldSchema;
    calculator: string | null;
    schema_version: number;
  } | null = null;
  if (id) {
    const { data, error } = await supabase
      .from("test_type")
      .select("field_schema, calculator, schema_version")
      .eq("company_id", office.company.id)
      .eq("id", id)
      .single();
    if (error) return failed(error);
    current = data;
  }

  if (current?.calculator) {
    // Built-in calculators: only their thresholds are editable.
    const options: Record<string, number> = { ...(current.field_schema.options ?? {}) };
    for (const key of Object.keys(options)) {
      const raw = text(form, `option_${key}`);
      const n = Number(raw);
      if (raw === "" || !Number.isFinite(n) || n < 0)
        return { fields: { [`option_${key}`]: "Enter a number, 0 or more." } };
      options[key] = n;
    }
    values.field_schema = { ...current.field_schema, options };
  } else {
    const { fields, errors } = parseFieldLines(text(form, "fields"));
    if (errors.length) return { fields: { fields: errors.join(" ") } };
    const schema: TestFieldSchema = { fields };
    const changed = JSON.stringify(current?.field_schema.fields) !== JSON.stringify(fields);
    values.field_schema = schema;
    // Results keep the schema version they were recorded with.
    if (current && changed) values.schema_version = current.schema_version + 1;
  }

  const { error } = await upsert(
    supabase,
    "test_type",
    office.company.id,
    id,
    values,
    id ? {} : { key: configKey(name, await takenKeys(supabase, "test_type", office.company.id)) },
  );
  if (error) return failed(error);
  return done("/settings/tests", id ? "Saved." : `Added ${name}.`);
}

export async function saveExclusionReason(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const id = text(form, "id");
  const label = text(form, "label");
  if (!label) return { fields: { label: "Enter a reason." } };
  const { error } = await upsert(supabase, "exclusion_reason", office.company.id, id, {
    label,
    sort_order: int(form, "sort_order"),
    active: id ? checked(form, "active") : true,
  });
  if (error) return failed(error);
  return done("/settings/exclusions", id ? "Saved." : "Added.");
}

export async function saveSeverity(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const id = text(form, "id");
  const name = text(form, "name");
  const color = text(form, "color");
  if (!name) return { fields: { name: "Enter a name." } };
  if (!isHexColor(color)) return { fields: { color: "Use a color like #C62F2B." } };
  const { error } = await upsert(
    supabase,
    "severity_level",
    office.company.id,
    id,
    {
      name,
      color: color.toUpperCase(),
      must_mention: checked(form, "must_mention"),
      sort_order: int(form, "sort_order"),
      active: id ? checked(form, "active") : true,
    },
    id
      ? {}
      : { key: configKey(name, await takenKeys(supabase, "severity_level", office.company.id)) },
  );
  if (error) return failed(error);
  return done("/settings/severities", id ? "Saved." : `Added ${name}.`);
}

export async function saveReportTemplate(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter a name." } };
  const { error } = await supabase
    .from("report_template")
    .update({ name, enabled: checked(form, "enabled") })
    .eq("company_id", office.company.id)
    .eq("id", text(form, "id"));
  if (error) return failed(error);
  return done("/settings/reports");
}
