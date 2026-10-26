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
  SAVED_REPORT_SECTIONS,
  visitReportMode,
  chargeChemicalsSettings,
  chargesChemicals,
  savedReportFrom,
  savedReportSections,
  INSPECTION_SECTIONS,
  optionsFromText,
  type ChecklistSection,
  TECH_COLORS,
  REORDER_TECHS,
  scheduleOrderWrites,
  uploadRefusal,
  uploadRefusalMessage,
  priceBookCategory,
} from "@leakbook/core";
import { OWNER_ONLY, requireManager, requireOwner } from "@/lib/auth";
import { friendlyDbError, isWebUrl } from "@/lib/limits";
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
  return { error: error ? friendlyDbError(error.message) : fallback };
}

// ---------------------------------------------------------------------------
// Company profile, branding, payments
// ---------------------------------------------------------------------------

/**
 * Settings › Company and Branding, the whole page at once (owner, 2026-10-22: "Let's remove all
 * the save buttons on that page and just have one floating one on the bottom"). Every field is
 * checked first, so nothing is saved while one is wrong; then the shop's row in one update, the
 * logo when one was chosen, the package when Services changed, and the next job number when it
 * changed (numbers only go up, so an unchanged one isn't sent again).
 */
export async function saveCompanySettings(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const fields: Record<string, string> = {};
  const name = text(form, "name");
  if (!name) fields.name = "Enter the company name.";
  const timezone = text(form, "timezone");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC")
    fields.timezone = "Pick a time zone.";
  // It goes into customer emails as a link: web pages only, never javascript: or data:.
  const review = text(form, "review_url");
  if (review && !isWebUrl(review))
    fields.review_url = "Enter a web address that starts with https://.";
  const quoteDays = parseReminderDays(text(form, "quote_days"));
  const invoiceDays = parseReminderDays(text(form, "invoice_days"));
  if (!quoteDays) fields.quote_days = "Enter days after sending, like 3, 7.";
  if (!invoiceDays) fields.invoice_days = "Enter days after sending, like 7, 14, 30.";
  const hasTerms = form.has("report_disclaimer");
  const disclaimer = text(form, "report_disclaimer");
  if (disclaimer.length > 20_000) fields.report_disclaimer = "Keep it under 20,000 characters.";
  const nextText = text(form, "next_job_number");
  const next = Number(nextText);
  const numberChanged = nextText !== text(form, "next_job_number_was");
  if (numberChanged && (!Number.isInteger(next) || next < 1 || next > 2_000_000_000))
    fields.next_job_number = "Enter a whole number, like 10450.";
  const primary = text(form, "brand_primary");
  const secondary = text(form, "brand_secondary");
  if (!isHexColor(primary)) fields.brand_primary = "Use a color like #12263A.";
  if (secondary && !isHexColor(secondary)) fields.brand_secondary = "Use a color like #EE6A1F.";
  const logo = form.get("logo");
  const logoFile = logo instanceof File && logo.size > 0 ? logo : null;
  const ext = logoFile
    ? { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" }[logoFile.type]
    : undefined;
  if (logoFile && !ext) fields.logo = "Use a PNG, JPEG, or SVG file.";
  else if (logoFile && logoFile.size > 2 * 1024 * 1024) fields.logo = "Use a file under 2 MB.";
  const services = form.has("services") ? text(form, "services") : null;
  if (services !== null && services !== "pool" && services !== "leak" && services !== "both")
    return { error: "Pick what your shop does." };
  if (Object.keys(fields).length) return { fields };

  const { data: company, error: readError } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  if (readError) return failed(readError);
  const current = (company.settings ?? {}) as Record<string, unknown>;
  const servicesChanged = services !== null && services !== (current.services ?? "both");
  const update: Record<string, unknown> = {
    name,
    legal_name: optional(form, "legal_name"),
    phone: optional(form, "phone"),
    email: optional(form, "email"),
    address_line1: optional(form, "address_line1"),
    address_line2: optional(form, "address_line2"),
    city: optional(form, "city"),
    state: optional(form, "state")?.toUpperCase() ?? null,
    postal_code: optional(form, "postal_code"),
    review_url: review || null,
    timezone,
    settings: {
      ...current,
      reminders: { quote_days: quoteDays, invoice_days: invoiceDays },
      review_requests: checked(form, "review_requests"),
      ...(servicesChanged ? { services } : {}),
    },
    brand_primary: primary.toUpperCase(),
    brand_secondary: secondary ? secondary.toUpperCase() : null,
    ...(hasTerms ? { report_disclaimer: disclaimer || null } : {}),
  };
  if (logoFile && ext) {
    // A new name each time, so reports already sent keep pointing at the old logo.
    const path = `${office.company.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("company-assets")
      .upload(path, logoFile, { contentType: logoFile.type, upsert: false });
    if (error) {
      // The bucket's own limits, or a read-only shop (security review M2), in plain words.
      const refusal = uploadRefusal(null, error.message);
      if (refusal) return { error: uploadRefusalMessage(refusal, "logo") };
      return failed(error);
    }
    update.logo_path = path;
  }
  const { error } = await supabase.from("company").update(update).eq("id", office.company.id);
  if (error) return failed(error);
  // Every route starts at the shop: find its coordinates when the address changed.
  await locateCompany(office);
  if (servicesChanged) {
    // A package taken on brings its checklist, tests, and price book (once; nothing is removed).
    const { error: setup } = await supabase.rpc("add_package_defaults", {
      target_company: office.company.id,
      services,
    });
    if (setup) return failed(setup);
    // The package sets the Sundeck Pro price.
    after(() => syncSubscriptionPrice(office.company.id).catch(logPriceSyncError));
  }
  if (numberChanged) {
    const { error: numberError } = await supabase.rpc("set_next_job_number", {
      target_company: office.company.id,
      next_number: next,
    });
    if (numberError) {
      revalidatePath("/", "layout");
      return { fields: { next_job_number: numberError.message } };
    }
  }
  revalidatePath("/", "layout");
  return { message: "Saved." };
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
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/** Owners and admins: what Complete Job waits for (owner, 2026-10-19). */
export async function saveCompleteJob(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = {
    ...((company?.settings ?? {}) as Record<string, unknown>),
    require_checklist_to_finish: checked(form, "require_checklist_to_finish"),
    require_finish_photo: checked(form, "require_finish_photo"),
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/** Settings › Report Templates › Visit reports: Automatic, By Hand, or Off (owner, 2026-10-20). */
export async function saveVisitReportMode(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = {
    ...((company?.settings ?? {}) as Record<string, unknown>),
    visit_reports: visitReportMode({ visit_reports: text(form, "visit_reports") }),
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/**
 * Settings › Report Templates › Visit reports › Require a Photo (owner, 2026-10-25): off by
 * default; on, a visit's report can't be sent until the visit has a photo (core report-photo.ts).
 */
export async function saveReportPhoto(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("settings")
    .eq("id", office.company.id)
    .single();
  const settings = {
    ...((company?.settings ?? {}) as Record<string, unknown>),
    require_report_photo: checked(form, "require_report_photo"),
  };
  const { error } = await supabase.from("company").update({ settings }).eq("id", office.company.id);
  if (error) return failed(error);
  revalidatePath("/", "layout");
  return { message: "Saved." };
}

/**
 * Settings › Price Book › Charge for Chemicals (owner, 2026-10-24): off by default; on, the
 * month's added chemicals go on each customer's monthly invoice, from the month it's turned on.
 */
export async function saveChargeChemicals(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  const supabase = await createClient();
  const { data: company } = await supabase
    .from("company")
    .select("settings, timezone")
    .eq("id", office.company.id)
    .single();
  const before = (company?.settings ?? {}) as Record<string, unknown>;
  const on = checked(form, "charge_chemicals");
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: (company?.timezone as string) ?? office.company.timezone,
  }).format(new Date());
  const settings = {
    ...before,
    // Already on: it keeps the month it started.
    ...(on && chargesChemicals(before) ? {} : chargeChemicalsSettings(on, today)),
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
      error: friendlyDbError(error.message).includes("at least one")
        ? "The shop needs at least one active owner."
        : error.message.includes("Only the shop owner")
          ? OWNER_ONLY
          : error.message,
    };
  // Turning a teammate off or on changes the people billed.
  after(() => syncSubscriptionPrice(office.company.id).catch(logPriceSyncError));
  return done("/settings/team");
}

/**
 * A teammate's color (Settings › Team, owner 2026-10-20): one of the palette's keys. Owners and
 * admins.
 */
export async function setMemberColor(input: { id: string; color: string }): Promise<FormState> {
  const { office, supabase } = await owner();
  if (!TECH_COLORS.some((c) => c.key === input.color)) return { error: "Pick one of the colors." };
  const { error } = await supabase
    .from("membership")
    .update({ color: input.color })
    .eq("company_id", office.company.id)
    .eq("id", input.id);
  if (error) return failed(error);
  // Every screen that names a tech shows their dot.
  revalidatePath("/", "layout");
  return { message: "Color changed." };
}

/**
 * The order of techs on the Schedule and Today (Reorder Techs, owner 2026-10-21; core
 * scheduleOrder): membership ids top to bottom. Writes only the places that changed. Owners and
 * admins.
 */
export async function setScheduleOrder(ordered: string[]): Promise<FormState> {
  const { office, supabase } = await owner();
  if (!Array.isArray(ordered) || ordered.some((id) => typeof id !== "string"))
    return { error: "Couldn’t save. Try again." };
  const { data, error } = await supabase
    .from("membership")
    .select("id, schedule_order")
    .eq("company_id", office.company.id)
    .is("deleted_at", null);
  if (error) return failed(error);
  const writes = scheduleOrderWrites(
    (data ?? []) as { id: string; schedule_order: number | null }[],
    [...new Set(ordered)],
  );
  for (const w of writes) {
    const r = await supabase
      .from("membership")
      .update({ schedule_order: w.schedule_order })
      .eq("company_id", office.company.id)
      .eq("id", w.id);
    if (r.error) return failed(r.error);
  }
  // The Schedule and Today list techs in this order.
  revalidatePath("/", "layout");
  return { message: REORDER_TECHS.saved };
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
  "saved_report",
  "team_profile",
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
  if (name.length > 200) fields.name = "Keep the name under 200 characters.";
  if (text(form, "unit").length > 40) fields.unit = "Keep the unit short, like each or hour.";
  if (text(form, "category_custom").length > 60) {
    fields.category_custom = "Keep the category under 60 characters.";
  }
  if (Object.keys(fields).length) return { fields };
  const { error } = await upsert(supabase, "price_book_item", office.company.id, text(form, "id"), {
    name,
    description: optional(form, "description"),
    // A choice of the shop's categories, or Other written in; Other when left blank.
    category: form.has("category_choice")
      ? priceBookCategory(text(form, "category_choice"), text(form, "category_custom"))
      : optional(form, "category"),
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
  if (text(form, "job_type") === "inspection") return saveInspectionQuestion(form, id, name);
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

/** A pool inspection question (2026-10-20): its section, group, answers, and banner. */
async function saveInspectionQuestion(
  form: FormData,
  id: string,
  name: string,
): Promise<FormState> {
  const { office, supabase } = await owner();
  const section = INSPECTION_SECTIONS.includes(text(form, "section") as ChecklistSection)
    ? text(form, "section")
    : "insp_equipment";
  const answer = ["choice", "multi", "text"].includes(text(form, "answer"))
    ? text(form, "answer")
    : "choice";
  const options = answer === "text" ? null : optionsFromText(String(form.get("options") ?? ""));
  if (options && options.length < 2) return { fields: { options: "Enter at least two choices." } };
  const values = {
    name,
    section,
    answer,
    options,
    group_label: text(form, "group_label") || null,
    notice: text(form, "notice") || null,
    sort_order: int(form, "sort_order"),
    active: id ? checked(form, "active") : true,
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
          job_type: "inspection",
          applies_to: "both",
          methods: ["Visual"],
        },
  );
  if (error) return failed(error);
  return done("/settings/components", id ? "Saved." : `Added ${name}.`);
}

/**
 * A person's profile (owner, 2026-10-20): name, phone, email, address, emergency contact and
 * notes, kept by owners and admins. `user` links it to a team member; without it, someone who
 * doesn't use the app.
 */
export async function saveTeamProfile(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const id = text(form, "id");
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter a name." } };
  const email = text(form, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { fields: { email: "Enter an email like name@example.com." } };
  const values = {
    name,
    phone: text(form, "phone") || null,
    email: email || null,
    address: text(form, "address") || null,
    emergency_name: text(form, "emergency_name") || null,
    emergency_phone: text(form, "emergency_phone") || null,
    notes: text(form, "notes") || null,
  };
  const user = text(form, "user");
  const { error } = await upsert(
    supabase,
    "team_profile",
    office.company.id,
    id,
    values,
    user ? { user_id: user } : {},
  );
  if (error) return failed(error);
  return done("/settings/team", id ? "Saved." : `Added ${name}.`);
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

/**
 * A saved report (owner, 2026-10-20: "a copy/paste essentially that the tech uses each time"):
 * its name and its text for each section, word for word. From Settings › Report Templates, or
 * Save as Saved Report on a draft (the draft's own text, sent as key/text pairs).
 */
export async function saveSavedReport(_: FormState, form: FormData): Promise<FormState> {
  const { office, supabase } = await owner();
  const id = text(form, "id");
  const name = text(form, "name");
  if (!name) return { fields: { name: "Enter a name." } };
  if (name.length > 80) return { fields: { name: "Keep it under 80 letters." } };
  const keys = form.getAll("key").map(String);
  const sections = keys.length
    ? savedReportFrom(
        keys.map((key, i) => ({ key, title: key, text: String(form.getAll("text")[i] ?? "") })),
      )
    : savedReportSections(
        Object.fromEntries(SAVED_REPORT_SECTIONS.map((s) => [s.key, text(form, s.key)])),
      );
  if (!Object.keys(sections).length) return { error: "Add some text to save." };
  const { error } = await upsert(supabase, "saved_report", office.company.id, id, {
    name,
    sections,
  });
  if (error) return failed(error);
  revalidatePath("/jobs", "layout");
  return done("/settings/reports", id ? "Saved." : "Saved report added.");
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
