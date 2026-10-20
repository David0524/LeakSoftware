/**
 * Row shapes for synced tables, as phones store them (server bookkeeping columns removed).
 * Mirrors supabase/migrations; only the tables the apps read so far.
 */
import type { DiagramShape } from "./inspection";
import type { JobStatus } from "./job-status";

interface Base {
  id: string;
  company_id: string;
  deleted_at?: string | null;
}

export interface CompanySettings {
  deposit: {
    type: "percent" | "fixed";
    value_bps?: number;
    value_cents?: number;
    minimum_cents: number;
  };
  tax_rate_bps: number;
  tech_discount_limit_bps: number;
  sync_window_days: number;
  /** Questions asked when booking (M8.5). */
  intake_questions?: IntakeQuestion[];
  /** Techs see every job (default), or only their own (owner setting, 2026-10-13). */
  techs_see_all_jobs?: boolean;
  /** Techs can make new jobs (default), or only owners can (owner setting, 2026-10-18). */
  techs_make_jobs?: boolean;
  /** What the shop does, which decides what the app shows (owner, 2026-10-16). */
  services?: Services;
  /** Where On My Way texts go out from (owner, 2026-10-16). Default: Sundeck Pro Messages. */
  on_my_way?: OnMyWayVia;
  /** A photo is needed before a tech finishes a job (owner setting, 2026-10-19). */
  require_finish_photo?: boolean;
  /** Every checklist item answered before a job is completed (owners and admins, 2026-10-19). */
  require_checklist_to_finish?: boolean;
}

/** Whether finishing a job needs a pool photo first (default off). */
export function requiresFinishPhoto(settings: unknown): boolean {
  return (settings as Partial<CompanySettings> | null)?.require_finish_photo === true;
}

export const FINISH_PHOTO_MESSAGE = "Take a photo of the pool before finishing this job.";

/** Whether completing a job needs every checklist item answered first (default off). */
export function requiresFinishedChecklist(settings: unknown): boolean {
  return (settings as Partial<CompanySettings> | null)?.require_checklist_to_finish === true;
}

export const FINISH_CHECKLIST_MESSAGE = "Finish the checklist before completing this job.";

/**
 * What stops Complete Job (owner, 2026-10-19: "Owners/admins can decide whether the tech needs
 * to fill out the checklist/submit picture first"): the checklist first, then the photo. Null
 * when the job can be completed.
 */
export function completeJobBlocker(
  settings: unknown,
  job: { checklistToDo: number; photos: number },
): string | null {
  if (requiresFinishedChecklist(settings) && job.checklistToDo > 0) return FINISH_CHECKLIST_MESSAGE;
  if (requiresFinishPhoto(settings) && job.photos === 0) return FINISH_PHOTO_MESSAGE;
  return null;
}

/**
 * Whether a stop on a day's route is done (owner, 2026-10-19: Mark Complete on every stop). A
 * job past the field part of its pipeline (Done, report sent, invoiced, ...) is done; a leak or
 * repair job is also done for the day once Mark Complete set stop_done_on to that day.
 */
export function stopDone(
  job: { status: string; stop_done_on?: string | null },
  day: string,
): boolean {
  if (job.status !== "scheduled" && job.status !== "in_progress") return true;
  return job.stop_done_on === day;
}

/**
 * What Mark Complete on Today writes: a maintenance visit is completed (status done); a leak
 * or repair job keeps its pipeline and its stop is marked done for the day.
 */
export function markCompleteValues(
  job: { type: string },
  day: string,
): { status: "done" } | { stop_done_on: string } {
  return job.type === "maintenance" ? { status: "done" } : { stop_done_on: day };
}

/**
 * Whether the job's page offers Schedule Job / Change Schedule (owner, 2026-10-20: "You should
 * be able to reschedule a job from the jobs page after creating it"): until its work is done,
 * started jobs included; repairs as before.
 */
export function jobReschedulable(job: { type: string; status: string }): boolean {
  return (
    job.type === "repair" ||
    job.status === "unscheduled" ||
    job.status === "scheduled" ||
    job.status === "in_progress"
  );
}

/**
 * What a done stop on Today offers (owner, 2026-10-20: "Maintenance jobs don't have a reopen
 * visit button on the Today page"): a completed maintenance visit, Reopen Visit (back to in
 * progress); a leak or repair stop marked done today, Mark Not Complete; otherwise nothing.
 */
export function todayUndo(
  job: { type: string; status: string; stop_done_on?: string | null },
  day: string,
): { label: "Reopen Visit" | "Mark Not Complete"; reopen: boolean } | null {
  if (job.type === "maintenance")
    return job.status === "done" ? { label: "Reopen Visit", reopen: true } : null;
  return job.stop_done_on === day && (job.status === "scheduled" || job.status === "in_progress")
    ? { label: "Mark Not Complete", reopen: false }
    : null;
}

/**
 * Whether the job page has a Wrap-Up section (report, signatures, quotes, invoice). Maintenance
 * visits don't (owner, 2026-10-19: "For maintenance, get rid of the wrap up tab entirely"):
 * they end with Complete Job, are billed monthly, and quote repairs from Details.
 */
export function jobHasWrapUp(type: JobType | string | null | undefined): boolean {
  return type !== "maintenance";
}

/**
 * On My Way texts: from the company number into Sundeck Pro's shared Messages (the default), or
 * from the tech's own phone (its Messages app opens with the text ready).
 */
export type OnMyWayVia = "messages" | "phone";

export const ON_MY_WAY_LABELS: Record<OnMyWayVia, string> = {
  messages: "Sundeck Pro Messages",
  phone: "Tech’s Phone",
};

export function onMyWayVia(settings: unknown): OnMyWayVia {
  return (settings as Partial<CompanySettings> | null)?.on_my_way === "phone"
    ? "phone"
    : "messages";
}

/**
 * The shop's line of work: pool care (cleaning routes and repairs), leak detection, or both.
 * Each is its own experience (and, later, its own subscription). Shops from before the split
 * have both.
 */
export type Services = "pool" | "leak" | "both";

export const SERVICES_LABELS: Record<Services, string> = {
  pool: "Pool Care",
  leak: "Leak Detection",
  both: "Both",
};

export function companyServices(settings: unknown): Services {
  const v = (settings as Partial<CompanySettings> | null)?.services;
  return v === "pool" || v === "leak" || v === "both" ? v : "both";
}

/** Whether the shop does leak detection (leak jobs, tests, findings, reports). */
/** A services value from a form or a link, or null when it isn't one. */
export function parseServices(v: unknown): Services | null {
  return v === "pool" || v === "leak" || v === "both" ? v : null;
}

export const offersLeak = (settings: unknown) => companyServices(settings) !== "pool";
/** Whether the shop does pool care (cleaning plans, the service checklist, monthly billing). */
export const offersPool = (settings: unknown) => companyServices(settings) !== "leak";

export type JobType = "detection" | "repair" | "maintenance" | "inspection";

/**
 * What the job's price is called (owner, 2026-10-19): a detection fee on leak detection, a
 * price on repairs and visits.
 */
export function jobFeeLabel(type: JobType | string | null | undefined): string {
  return type === "detection" ? "Detection fee" : "Price";
}

/**
 * The jobs New Job offers, in this order (owner, 2026-10-20: "service, repair, leak, pool
 * inspection"): Service (pool care shops), Repair (every shop, owner 2026-10-18), then Leak and
 * Inspection (leak shops). Short labels, so all four fit across a phone.
 */
export function newJobTypes(services: Services): { value: JobType; label: string }[] {
  return [
    ...(services !== "leak" ? [{ value: "maintenance" as const, label: "Service" }] : []),
    { value: "repair", label: "Repair" },
    ...(services !== "pool"
      ? [
          { value: "detection" as const, label: "Leak" },
          { value: "inspection" as const, label: "Inspection" },
        ]
      : []),
  ];
}

/** Whether this member sees every job: owners and admins always; techs unless limited. */
export function seesAllJobs(role: string | null | undefined, settings: unknown): boolean {
  if (isManagerRole(role)) return true;
  return (settings as Partial<CompanySettings> | null)?.techs_see_all_jobs !== false;
}

/** Whether this member can make new jobs: owners and admins always; techs unless turned off. */
export function canMakeJobs(role: string | null | undefined, settings: unknown): boolean {
  if (isManagerRole(role)) return true;
  return (settings as Partial<CompanySettings> | null)?.techs_make_jobs !== false;
}

/** job.intake's key for the price book item a repair was booked for (When They Call). */
export const REPAIR_ITEM_KEY = "repair_item";
export const REPAIR_ITEM_LABEL = "What they need";

export interface IntakeQuestion {
  key: string;
  label: string;
  type: "multi" | "single" | "text";
  options?: string[];
  /** The job types that ask it; none: leak detection (intakeQuestionsFor). */
  job_types?: JobType[];
}

/** Split "a@x.com b@y.com, c@z.com" into addresses. */
export function splitEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => /^\S+@\S+\.\S+$/.test(e));
}

export interface Company extends Base {
  name: string;
  phone?: string | null;
  email?: string | null;
  timezone: string;
  brand_primary: string;
  logo_path?: string | null;
  settings: CompanySettings;
}

/**
 * Owner: full access and shop-level control (Sundeck Pro billing, payments setup, roles,
 * security settings). Admin: office staff, everything else an owner does. Tech: the field
 * (owner, 2026-10-18).
 */
export type Role = "owner" | "admin" | "tech";

export const ROLE_LABELS: Record<Role, string> = { owner: "Owner", admin: "Admin", tech: "Tech" };

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABELS[role as Role] ?? "Tech";
}

/** Owner or admin: runs the shop (everything but the owner-only items). */
export function isManagerRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** The roles this person may give someone: owners give any, admins only Tech. */
export function assignableRoles(role: string | null | undefined): Role[] {
  return role === "owner" ? ["owner", "admin", "tech"] : isManagerRole(role) ? ["tech"] : [];
}

export interface Membership extends Base {
  user_id: string;
  role: Role;
  status: "active" | "disabled";
}

export type CustomerKind =
  "homeowner" | "pool_company" | "builder" | "insurer" | "property_manager" | "other";

export interface Customer extends Base {
  kind: CustomerKind;
  name: string;
  company_name?: string | null;
  email?: string | null;
  /** Other addresses that also get reports (M8.5). */
  cc_emails?: string[];
  /** No reminder or review emails (M10). */
  marketing_opt_out?: boolean;
  phone?: string | null;
  notes?: string | null;
}

export type PoolType = "gunite_plaster" | "vinyl" | "fiberglass" | "other";

export interface Property extends Base {
  customer_id: string;
  address_line1: string;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  pool_type?: PoolType | null;
  has_pool: boolean;
  has_spa: boolean;
  diagram_shape?: DiagramShape | null;
  approx_gallons?: number | null;
  /** Mirror and spa placement (owner, 2026-10-19); read with parseDiagramLayout. */
  diagram_layout?: unknown;
  access_notes?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** The address the coordinates were found for (routing). */
  geocoded_address?: string | null;
  location_source?: "geocoder" | "gps" | "manual" | null;
}

export interface Job extends Base {
  number?: number | null;
  type: JobType;
  property_id: string;
  bill_to_customer_id?: string | null;
  status: JobStatus;
  assigned_user_id?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  summary_notes?: string | null;
  /** Detection fee in cents (M8.5). */
  fee_cents?: number | null;
  second_tech_id?: string | null;
  intake?: Record<string, string | string[]> | null;
  location_marked?: boolean | null;
  /** Today's Mark Complete on a leak or repair job: the shop-local day its stop was done. */
  stop_done_on?: string | null;
  /** Markup on the job's pool diagram (owner, 2026-10-19); read with parseMarkup. */
  diagram_markup?: unknown;
  /** Place in the tech's route that day, 1 = first stop (routing). */
  route_order?: number | null;
  /** The customer was told this time: planning never moves it (both locks; kept for old builds). */
  arrival_fixed?: boolean;
  /** Locks (owner, 2026-10-20): stays on its day / keeps its clock time. Both = arrival_fixed. */
  lock_day?: boolean;
  lock_time?: boolean;
  /** A maintenance visit's plan, and the plan's date for it. */
  service_plan_id?: string | null;
  plan_date?: string | null;
  /** A maintenance visit's monthly invoice (set by the server). */
  billed_invoice_id?: string | null;
  /** On My Way: when it was sent, and the arrival it promised (owner, 2026-10-20). */
  on_my_way_at?: string | null;
  arrive_at?: string | null;
  created_at?: string;
}

export const POOL_TYPE_LABELS: Record<PoolType, string> = {
  gunite_plaster: "Gunite / plaster",
  vinyl: "Vinyl",
  fiberglass: "Fiberglass",
  other: "Other",
};

export const JOB_TYPE_LABELS: Record<Job["type"], string> = {
  detection: "Leak detection",
  repair: "Repair",
  maintenance: "Maintenance",
  inspection: "Pool inspection",
};
