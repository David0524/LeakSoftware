import "server-only";
import type {
  ChecklistItemResult,
  ComponentType,
  Customer,
  ExclusionReason,
  Finding,
  Job,
  JobComponent,
  JobStatus,
  Media,
  Property,
  SeverityLevel,
  TestResult,
  TestType,
} from "@leakbook/core";
import type { Office } from "./auth";
import { createClient } from "./supabase/server";

// Office reads. Every query runs as the signed-in user (RLS) and is also scoped to the
// active company, since one person can belong to more than one shop.

type Db = Awaited<ReturnType<typeof createClient>>;

async function db(): Promise<Db> {
  return createClient();
}

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export interface TeamMember {
  user_id: string;
  role: "owner" | "tech";
  status: "active" | "disabled";
  membership_id: string;
  name: string;
  email: string | null;
}

export async function getTeam(office: Office): Promise<TeamMember[]> {
  const supabase = await db();
  const members = must(
    await supabase
      .from("membership")
      .select("id, user_id, role, status")
      .eq("company_id", office.company.id)
      .is("deleted_at", null),
  ) as { id: string; user_id: string; role: "owner" | "tech"; status: "active" | "disabled" }[];
  const profiles = members.length
    ? (must(
        await supabase
          .from("profile")
          .select("id, full_name, email")
          .in(
            "id",
            members.map((m) => m.user_id),
          ),
      ) as { id: string; full_name: string | null; email: string | null }[])
    : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return members
    .map((m) => {
      const p = byId.get(m.user_id);
      return {
        user_id: m.user_id,
        membership_id: m.id,
        role: m.role,
        status: m.status,
        name: p?.full_name || p?.email || "Teammate",
        email: p?.email ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobRow extends Job {
  property: Property | null;
  customer: Customer | null;
  techName: string | null;
}

async function attach(office: Office, jobs: Job[]): Promise<JobRow[]> {
  const supabase = await db();
  const propertyIds = [...new Set(jobs.map((j) => j.property_id))];
  const [properties, team] = await Promise.all([
    propertyIds.length
      ? (must(await supabase.from("property").select("*").in("id", propertyIds)) as Property[])
      : [],
    getTeam(office),
  ]);
  const customerIds = [
    ...new Set([
      ...jobs.map((j) => j.bill_to_customer_id).filter((x): x is string => !!x),
      ...properties.map((p) => p.customer_id),
    ]),
  ];
  const customers = customerIds.length
    ? (must(await supabase.from("customer").select("*").in("id", customerIds)) as Customer[])
    : [];
  const propById = new Map(properties.map((p) => [p.id, p]));
  const custById = new Map(customers.map((c) => [c.id, c]));
  const techById = new Map(team.map((t) => [t.user_id, t.name]));
  return jobs.map((j) => {
    const property = propById.get(j.property_id) ?? null;
    return {
      ...j,
      property,
      customer:
        custById.get(j.bill_to_customer_id ?? "") ??
        (property ? (custById.get(property.customer_id) ?? null) : null),
      techName: j.assigned_user_id ? (techById.get(j.assigned_user_id) ?? "Teammate") : null,
    };
  });
}

export const OPEN_STATUSES: JobStatus[] = [
  "unscheduled",
  "scheduled",
  "in_progress",
  "report_sent",
  "quote_sent",
  "quote_accepted",
  "invoiced",
];

export async function listJobs(office: Office, statuses: JobStatus[] | null): Promise<JobRow[]> {
  const supabase = await db();
  let q = supabase
    .from("job")
    .select("*")
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: true, nullsFirst: false })
    .order("number", { ascending: false })
    .limit(500);
  if (statuses) q = q.in("status", statuses);
  return attach(office, must(await q) as Job[]);
}

export async function jobsBetween(office: Office, fromIso: string, toIso: string) {
  const supabase = await db();
  const jobs = must(
    await supabase
      .from("job")
      .select("*")
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .neq("status", "canceled")
      .gte("scheduled_start", fromIso)
      .lt("scheduled_start", toIso)
      .order("scheduled_start"),
  ) as Job[];
  return attach(office, jobs);
}

export interface JobDetail {
  job: JobRow;
  components: JobComponent[];
  componentTypes: Map<string, ComponentType>;
  results: Map<string, ChecklistItemResult>;
  tests: TestResult[];
  testTypes: Map<string, TestType>;
  findings: Finding[];
  severities: Map<string, SeverityLevel>;
  media: Media[];
}

export async function getJob(office: Office, id: string): Promise<JobDetail | null> {
  const supabase = await db();
  const job = must(
    await supabase
      .from("job")
      .select("*")
      .eq("company_id", office.company.id)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
  ) as Job | null;
  if (!job) return null;
  const live = <T>(table: string) =>
    supabase.from(table).select("*").eq("job_id", id).is("deleted_at", null) as unknown as Promise<{
      data: T[] | null;
      error: { message: string } | null;
    }>;
  const cfg = <T>(table: string) =>
    supabase.from(table).select("*").eq("company_id", office.company.id) as unknown as Promise<{
      data: T[] | null;
      error: { message: string } | null;
    }>;
  const [[row], components, results, tests, findings, media, types, testTypes, severities] =
    await Promise.all([
      attach(office, [job]),
      live<JobComponent>("job_component").then(must),
      live<ChecklistItemResult>("checklist_item_result").then(must),
      live<TestResult>("test_result").then(must),
      live<Finding>("finding").then(must),
      live<Media>("media").then(must),
      cfg<ComponentType>("component_type").then(must),
      cfg<TestType>("test_type").then(must),
      cfg<SeverityLevel>("severity_level").then(must),
    ]);
  return {
    job: row!,
    components: components.sort((a, b) => a.sort_order - b.sort_order),
    componentTypes: new Map(types.map((t) => [t.id, t])),
    results: new Map(results.map((r) => [r.job_component_id, r])),
    tests: tests.sort((a, b) => (a.performed_at ?? "").localeCompare(b.performed_at ?? "")),
    testTypes: new Map(testTypes.map((t) => [t.id, t])),
    // UUIDv7 ids sort by creation time.
    findings: findings.sort((a, b) => a.id.localeCompare(b.id)),
    severities: new Map(severities.map((s) => [s.key, s])),
    media: media.sort((a, b) => (a.captured_at ?? "").localeCompare(b.captured_at ?? "")),
  };
}

/** Short-lived links for showing media in the browser. */
export async function signedMediaUrls(paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const supabase = await db();
  const { data } = await supabase.storage.from("media").createSignedUrls(paths, 3600);
  return new Map(
    (data ?? [])
      .filter((d) => d.signedUrl && d.path)
      .map((d) => [d.path as string, d.signedUrl as string]),
  );
}

export interface AuditRow {
  id: number;
  user_id: string | null;
  table_name: string;
  row_id: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

/** Audit entries for these rows, newest first. Owners only (RLS returns nothing to techs). */
export async function auditFor(office: Office, rowIds: string[]): Promise<AuditRow[]> {
  if (!office.isOwner || rowIds.length === 0) return [];
  const supabase = await db();
  return must(
    await supabase
      .from("audit_log")
      .select("id, user_id, table_name, row_id, field, old_value, new_value, created_at")
      .eq("company_id", office.company.id)
      .in("row_id", rowIds)
      .order("created_at", { ascending: false })
      .limit(1000),
  ) as AuditRow[];
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(office: Office, search: string) {
  const supabase = await db();
  let q = supabase
    .from("customer")
    .select("*")
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .order("name")
    .limit(300);
  const term = search.replace(/[%,()]/g, " ").trim();
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  const customers = must(await q) as Customer[];
  const properties = customers.length
    ? (must(
        await supabase
          .from("property")
          .select("*")
          .in(
            "customer_id",
            customers.map((c) => c.id),
          )
          .is("deleted_at", null),
      ) as Property[])
    : [];
  return customers.map((c) => ({
    ...c,
    properties: properties.filter((p) => p.customer_id === c.id),
  }));
}

export async function getCustomer(office: Office, id: string) {
  const supabase = await db();
  const customer = must(
    await supabase
      .from("customer")
      .select("*")
      .eq("company_id", office.company.id)
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle(),
  ) as Customer | null;
  if (!customer) return null;
  const properties = must(
    await supabase
      .from("property")
      .select("*")
      .eq("customer_id", id)
      .is("deleted_at", null)
      .order("address_line1"),
  ) as Property[];
  const jobs = properties.length
    ? (must(
        await supabase
          .from("job")
          .select("*")
          .in(
            "property_id",
            properties.map((p) => p.id),
          )
          .is("deleted_at", null)
          .order("scheduled_start", { ascending: false, nullsFirst: true }),
      ) as Job[])
    : [];
  return { customer, properties, jobs: await attach(office, jobs) };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getCompany(office: Office) {
  const supabase = await db();
  return must(
    await supabase.from("company").select("*").eq("id", office.company.id).single(),
  ) as Record<string, unknown> & {
    id: string;
    name: string;
    settings: Record<string, unknown>;
    logo_path: string | null;
    brand_primary: string;
    brand_secondary: string | null;
    timezone: string;
  };
}

export async function listConfig<T>(office: Office, table: string): Promise<T[]> {
  const supabase = await db();
  const rows = must(
    await supabase
      .from(table)
      .select("*")
      .eq("company_id", office.company.id)
      .is("deleted_at", null),
  ) as (T & { sort_order?: number })[];
  return rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export type { ComponentType, ExclusionReason, SeverityLevel, TestType };
