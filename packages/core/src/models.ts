/**
 * Row shapes for synced tables, as phones store them (server bookkeeping columns removed).
 * Mirrors supabase/migrations; only the tables the apps read so far.
 */
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
  /** What the shop does, which decides what the app shows (owner, 2026-10-16). */
  services?: Services;
  /** Where On My Way texts go out from (owner, 2026-10-16). Default: Tidemark Messages. */
  on_my_way?: OnMyWayVia;
}

/**
 * On My Way texts: from the company number into Tidemark's shared Messages (the default), or
 * from the tech's own phone (its Messages app opens with the text ready).
 */
export type OnMyWayVia = "messages" | "phone";

export const ON_MY_WAY_LABELS: Record<OnMyWayVia, string> = {
  messages: "Tidemark Messages",
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

/** Whether the shop does leak detection (leak jobs, tests, findings, reports, warranties). */
/** A services value from a form or a link, or null when it isn't one. */
export function parseServices(v: unknown): Services | null {
  return v === "pool" || v === "leak" || v === "both" ? v : null;
}

export const offersLeak = (settings: unknown) => companyServices(settings) !== "pool";
/** Whether the shop does pool care (cleaning plans, the service checklist, monthly billing). */
export const offersPool = (settings: unknown) => companyServices(settings) !== "leak";

/** Whether this member sees every job: owners always; techs unless the owner limits them. */
export function seesAllJobs(role: string | null | undefined, settings: unknown): boolean {
  if (role === "owner") return true;
  return (settings as Partial<CompanySettings> | null)?.techs_see_all_jobs !== false;
}

export interface IntakeQuestion {
  key: string;
  label: string;
  type: "multi" | "single" | "text";
  options?: string[];
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

export type Role = "owner" | "tech";

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
  diagram_shape?: "rectangle" | "oval" | "kidney" | "l_shape" | "freeform" | null;
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
  type: "detection" | "repair" | "maintenance";
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
  /** Place in the tech's route that day, 1 = first stop (routing). */
  route_order?: number | null;
  /** The customer was told this time: planning never moves it. */
  arrival_fixed?: boolean;
  /** A maintenance visit's plan, and the plan's date for it. */
  service_plan_id?: string | null;
  plan_date?: string | null;
  /** A maintenance visit's monthly invoice (set by the server). */
  billed_invoice_id?: string | null;
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
};
