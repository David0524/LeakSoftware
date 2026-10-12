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
}

export interface Job extends Base {
  number?: number | null;
  type: "detection" | "repair";
  property_id: string;
  bill_to_customer_id?: string | null;
  status: JobStatus;
  assigned_user_id?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  summary_notes?: string | null;
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
};
