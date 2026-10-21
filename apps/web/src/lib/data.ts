import "server-only";
import { cache } from "react";
import type {
  ChemicalReading,
  CompanyAccess,
  ChecklistItemResult,
  ComponentType,
  Customer,
  ExclusionReason,
  Finding,
  InvoiceStatus,
  Job,
  JobComponent,
  JobStatus,
  Media,
  Property,
  PlanCleaning,
  ServicePlan,
  SeverityLevel,
  TestResult,
  TestType,
} from "@leakbook/core";
import {
  canMakeJobs,
  checklistTally,
  cleaningKind,
  inspectionProgress,
  jobSort,
  sortJobs,
  type CleaningKind,
  type JobSort,
  techColor,
  type TechColor,
} from "@leakbook/core";
import type { Office } from "./auth";
import { createClient } from "./supabase/server";
import { isUuid } from "./uuid";

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
  role: "owner" | "admin" | "tech";
  status: "active" | "disabled";
  membership_id: string;
  name: string;
  email: string | null;
  /** Their color (Settings › Team), a palette key: a dot before their name everywhere. */
  color: TechColor;
  /** When they were turned off, for Team's order. */
  disabled_at: string | null;
}

/** Cached per request: several parts of a page ask for the team. */
export const getTeam = cache(async (office: Office): Promise<TeamMember[]> => {
  const supabase = await db();
  // Names come with the memberships (membership_user_profile_fkey): one round trip, not two.
  const members = must(
    await supabase
      .from("membership")
      .select(
        "id, user_id, role, status, color, disabled_at, profile:profile!membership_user_profile_fkey(id, full_name, email)",
      )
      .eq("company_id", office.company.id)
      .is("deleted_at", null),
  ) as unknown as {
    id: string;
    user_id: string;
    role: "owner" | "admin" | "tech";
    status: "active" | "disabled";
    color: string | null;
    disabled_at: string | null;
    profile: { id: string; full_name: string | null; email: string | null } | null;
  }[];
  const profiles = members.flatMap((m) => (m.profile ? [m.profile] : []));
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
        color: techColor(m.color),
        disabled_at: m.disabled_at ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobRow extends Job {
  property: Property | null;
  customer: Customer | null;
  techName: string | null;
  secondTechName: string | null;
  /** The tech's color, for the dot before their name. */
  techColor: TechColor | null;
}

/**
 * A job with its pool, the pool's owner, and the customer billed, in the same response. Each
 * of these was its own round trip to the database after the jobs came back.
 */
const JOB_SELECT =
  "*, property:property!job_property_id_company_id_fkey(*, owner:customer!property_customer_id_company_id_fkey(*)), bill_to:customer!job_bill_to_customer_id_company_id_fkey(*)";

type EmbeddedJob = Job & {
  property?: (Property & { owner?: Customer | null }) | null;
  bill_to?: Customer | null;
};

/** Starts loading the team now, so it arrives alongside the page's own query. */
function preloadTeam(office: Office) {
  getTeam(office).catch(() => {});
}

async function attach(office: Office, jobs: EmbeddedJob[]): Promise<JobRow[]> {
  // Jobs loaded with JOB_SELECT carry their pool and customers: only the team is left.
  if (jobs.every((j) => j.property !== undefined)) {
    const team = await getTeam(office);
    const techById = new Map(team.map((t) => [t.user_id, t.name]));
    const colorById = new Map(team.map((t) => [t.user_id, t.color]));
    return jobs.map(({ property: embedded, bill_to, ...j }) => {
      const { owner, ...property } = embedded ?? ({} as Property & { owner?: Customer | null });
      return {
        ...j,
        property: embedded ? (property as Property) : null,
        customer: bill_to ?? owner ?? null,
        techName: j.assigned_user_id ? (techById.get(j.assigned_user_id) ?? "Teammate") : null,
        secondTechName: j.second_tech_id ? (techById.get(j.second_tech_id) ?? "Teammate") : null,
        techColor: j.assigned_user_id ? (colorById.get(j.assigned_user_id) ?? null) : null,
      };
    });
  }
  const supabase = await db();
  const propertyIds = [...new Set(jobs.map((j) => j.property_id))];
  const poolsAndCustomers = async () => {
    const properties = propertyIds.length
      ? (must(await supabase.from("property").select("*").in("id", propertyIds)) as Property[])
      : [];
    const customerIds = [
      ...new Set([
        ...jobs.map((j) => j.bill_to_customer_id).filter((x): x is string => !!x),
        ...properties.map((p) => p.customer_id),
      ]),
    ];
    const customers = customerIds.length
      ? (must(await supabase.from("customer").select("*").in("id", customerIds)) as Customer[])
      : [];
    return { properties, customers };
  };
  const [{ properties, customers }, team] = await Promise.all([
    poolsAndCustomers(),
    getTeam(office),
  ]);
  const propById = new Map(properties.map((p) => [p.id, p]));
  const custById = new Map(customers.map((c) => [c.id, c]));
  const techById = new Map(team.map((t) => [t.user_id, t.name]));
  const colorById = new Map(team.map((t) => [t.user_id, t.color]));
  return jobs.map((j) => {
    const property = propById.get(j.property_id) ?? null;
    return {
      ...j,
      property,
      customer:
        custById.get(j.bill_to_customer_id ?? "") ??
        (property ? (custById.get(property.customer_id) ?? null) : null),
      techName: j.assigned_user_id ? (techById.get(j.assigned_user_id) ?? "Teammate") : null,
      secondTechName: j.second_tech_id ? (techById.get(j.second_tech_id) ?? "Teammate") : null,
      techColor: j.assigned_user_id ? (colorById.get(j.assigned_user_id) ?? null) : null,
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

/**
 * A page of jobs (M11: the full list was a megabyte on a phone). `search` matches the job
 * number or the customer's name. Returns one row past `limit` so the page knows there's more.
 */
export async function listJobs(
  office: Office,
  statuses: JobStatus[] | null,
  opts: { limit?: number; search?: string; sort?: JobSort } = {},
): Promise<JobRow[]> {
  const supabase = await db();
  preloadTeam(office);
  const limit = Math.min(opts.limit ?? 50, 500);
  const sort = jobSort(opts.sort);
  // The search, as filters on job (customers by name, their pools, or a job number).
  let terms: string[] | null = null;
  const search = opts.search?.trim();
  if (search) {
    const number = /^#?\d+$/.test(search) ? Number(search.replace("#", "")) : null;
    const { data: people } = await supabase
      .from("customer")
      .select("id")
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .ilike("name", `%${search.replace(/[%_,()]/g, " ")}%`)
      .limit(200);
    const ids = (people ?? []).map((c) => c.id as string);
    const { data: pools } = ids.length
      ? await supabase.from("property").select("id").in("customer_id", ids)
      : { data: [] };
    terms = [
      ids.length ? `bill_to_customer_id.in.(${ids.join(",")})` : null,
      pools?.length ? `property_id.in.(${pools.map((p) => p.id).join(",")})` : null,
      number ? `number.eq.${number}` : null,
    ].filter((t): t is string => !!t);
    if (terms.length === 0) return [];
  }
  const filtered = <Q>(q: Q): Q => {
    // Typed loosely: the same filters on two selects.
    let r = (q as unknown as JobQuery).eq("company_id", office.company.id).is("deleted_at", null);
    if (statuses) r = r.in("status", statuses);
    if (terms) r = r.or(terms.join(","));
    return r as unknown as Q;
  };

  // Jobs sort in the database, so Show More pages stay in order (owner, 2026-10-20: "Add
  // sorting on the jobs page just like invoices"); ties go to the highest job number.
  if (sort === "customer") {
    // A job's customer is its bill-to, else its pool's owner: two embeds the database can't
    // order by together. The matching jobs' names come first (small rows), sorted here, then
    // that page's jobs in full.
    const names = must(
      await filtered(
        supabase
          .from("job")
          .select(
            "id, number, bill_to:customer!job_bill_to_customer_id_company_id_fkey(name), property:property!job_property_id_company_id_fkey(owner:customer!property_customer_id_company_id_fkey(name))",
          ),
      ).limit(5000),
    ) as unknown as {
      id: string;
      number: number | null;
      bill_to: { name: string } | null;
      property: { owner: { name: string } | null } | null;
    }[];
    const page = sortJobs(
      names.map((n) => ({
        id: n.id,
        number: n.number,
        customer: n.bill_to?.name ?? n.property?.owner?.name ?? null,
      })),
      "customer",
    ).slice(0, limit + 1);
    if (!page.length) return [];
    const rows = must(
      await supabase
        .from("job")
        .select(JOB_SELECT)
        .eq("company_id", office.company.id)
        .in(
          "id",
          page.map((p) => p.id),
        ),
    ) as EmbeddedJob[];
    const at = new Map(page.map((p, i) => [p.id, i]));
    return attach(
      office,
      rows.sort((a, b) => (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0)),
    );
  }
  let q = filtered(supabase.from("job").select(JOB_SELECT));
  q =
    sort === "newest"
      ? q.order("created_at", { ascending: false })
      : sort === "oldest"
        ? q.order("created_at", { ascending: true })
        : sort === "number"
          ? q
          : q.order("scheduled_start", { ascending: true, nullsFirst: false });
  q = q.order("number", { ascending: false }).limit(limit + 1);
  const jobs = await attach(office, must(await q) as EmbeddedJob[]);
  // The same order with the apps' tie-breaking (core sortJobs).
  return sortJobs(
    jobs.map((job) => ({
      job,
      number: job.number,
      scheduled_start: job.scheduled_start,
      created_at: job.created_at,
      customer: job.customer?.name ?? null,
    })),
    sort,
  ).map((k) => k.job);
}

/** The filters listJobs puts on its selects. */
interface JobQuery {
  eq(column: string, value: unknown): JobQuery;
  is(column: string, value: null): JobQuery;
  in(column: string, values: readonly unknown[]): JobQuery;
  or(filters: string): JobQuery;
}

export async function jobsBetween(office: Office, fromIso: string, toIso: string) {
  const supabase = await db();
  preloadTeam(office);
  const jobs = must(
    await supabase
      .from("job")
      .select(JOB_SELECT)
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .neq("status", "canceled")
      .gte("scheduled_start", fromIso)
      .lt("scheduled_start", toIso)
      .order("scheduled_start"),
  ) as EmbeddedJob[];
  return attach(office, jobs);
}

/** Booked jobs with nobody assigned, from `fromIso` on (they wait in Needs a Time). */
export async function unassignedFrom(office: Office, fromIso: string): Promise<JobRow[]> {
  const supabase = await db();
  preloadTeam(office);
  const jobs = must(
    await supabase
      .from("job")
      .select(JOB_SELECT)
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .eq("status", "scheduled")
      .is("assigned_user_id", null)
      .gte("scheduled_start", fromIso)
      .order("scheduled_start")
      .limit(200),
  ) as EmbeddedJob[];
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

/** A pool inspection's items in checklist order, with their gates' answers, for folding. */
export function inspectionRows(detail: JobDetail) {
  return detail.components.flatMap((c) => {
    const t = detail.componentTypes.get(c.component_type_id);
    const r = detail.results.get(c.id);
    return t
      ? [
          {
            id: c.id,
            section: t.section ?? null,
            group_label: t.group_label ?? null,
            options: t.options,
            value: r?.value,
            result: r ? { status: r.status, outcome: r.outcome ?? null } : null,
          },
        ]
      : [];
  });
}

/**
 * How far a job's checklist is, as the Live Activity counts it: answered items of all, and for a
 * pool inspection only the questions its gates leave open (2026-10-20).
 */
export function checklistCount(detail: JobDetail): { done: number; total: number } {
  if (detail.job.type === "inspection") {
    const p = inspectionProgress(inspectionRows(detail));
    return { done: p.answered, total: p.total };
  }
  const t = checklistTally(detail.components, [...detail.results.values()]);
  const total = t.pass + t.attention + t.leaking + t.notApplicable + t.pending;
  return { done: total - t.pending, total };
}

export async function getJob(office: Office, id: string): Promise<JobDetail | null> {
  // A mistyped link (/jobs/abc) is "not found", not the error screen (the query would fail).
  if (!isUuid(id)) return null;
  const supabase = await db();
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
  // Everything starts at once, the job's pool and customers in the same response.
  preloadTeam(office);
  const jobRow = (async () => {
    const job = must(
      await supabase
        .from("job")
        .select(JOB_SELECT)
        .eq("company_id", office.company.id)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
    ) as EmbeddedJob | null;
    return job ? (await attach(office, [job]))[0]! : null;
  })();
  const [row, components, results, tests, findings, media, types, testTypes, severities] =
    await Promise.all([
      jobRow,
      live<JobComponent>("job_component").then(must),
      live<ChecklistItemResult>("checklist_item_result").then(must),
      live<TestResult>("test_result").then(must),
      live<Finding>("finding").then(must),
      live<Media>("media").then(must),
      cfg<ComponentType>("component_type").then(must),
      cfg<TestType>("test_type").then(must),
      cfg<SeverityLevel>("severity_level").then(must),
    ]);
  if (!row) return null;
  return {
    job: row,
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
  if (!office.isManager || rowIds.length === 0) return [];
  const supabase = await db();
  // The ids go in the request's address, so a long checklist (a pool inspection has 133
  // questions, each with its answer row) is read in batches that keep it short.
  const batches: string[][] = [];
  for (let i = 0; i < rowIds.length; i += 100) batches.push(rowIds.slice(i, i + 100));
  const rows = await Promise.all(
    batches.map(
      async (ids) =>
        must(
          await supabase
            .from("audit_log")
            .select("id, user_id, table_name, row_id, field, old_value, new_value, created_at")
            .eq("company_id", office.company.id)
            .in("row_id", ids)
            .order("created_at", { ascending: false })
            .limit(1000),
        ) as AuditRow[],
    ),
  );
  return rows
    .flat()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 1000);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const CUSTOMER_SORTS = {
  name: "Name A–Z",
  name_desc: "Name Z–A",
  newest: "Newest",
  oldest: "Oldest",
  last_visit: "Last Visit",
  city: "City",
} as const;
export type CustomerSort = keyof typeof CUSTOMER_SORTS;

/** all, plan, no_plan, or a customer kind (homeowner, pool_company, ...). */
export type CustomerShow = string;

/**
 * Customers for the list, searched, filtered, and sorted (owner, 2026-10-18: "sort customers by
 * a variety of filters"). Each comes with its pools, whether it has a maintenance plan, and its
 * last visit.
 */
export async function listCustomers(
  office: Office,
  search: string,
  opts: { sort?: CustomerSort; show?: CustomerShow } = {},
) {
  const sort = opts.sort ?? "name";
  const show = opts.show ?? "all";
  const supabase = await db();
  let q = supabase
    .from("customer")
    .select("*")
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .order(sort === "newest" || sort === "oldest" ? "created_at" : "name", {
      ascending: sort !== "newest" && sort !== "name_desc",
    })
    .limit(500);
  const term = search.replace(/[%,()]/g, " ").trim();
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);
  if (!["all", "plan", "no_plan"].includes(show)) q = q.eq("kind", show);
  const customers = must(await q) as Customer[];
  const ids = customers.map((c) => c.id);
  const [properties, plans, visits] = ids.length
    ? await Promise.all([
        supabase.from("property").select("*").in("customer_id", ids).is("deleted_at", null),
        supabase
          .from("service_plan")
          .select("customer_id")
          .in("customer_id", ids)
          .is("deleted_at", null),
        supabase
          .from("job")
          .select("bill_to_customer_id, scheduled_start, completed_at")
          .in("bill_to_customer_id", ids)
          .is("deleted_at", null)
          .neq("status", "canceled")
          .lte("scheduled_start", new Date().toISOString())
          .order("scheduled_start", { ascending: false })
          .limit(5000),
      ]).then(
        ([p, sp, j]) =>
          [
            must(p) as Property[],
            must(sp) as { customer_id: string }[],
            must(j) as {
              bill_to_customer_id: string;
              scheduled_start: string | null;
              completed_at: string | null;
            }[],
          ] as const,
      )
    : ([[], [], []] as const);
  const withPlan = new Set(plans.map((p) => p.customer_id));
  const lastVisit = new Map<string, string>();
  for (const v of visits) {
    const at = v.completed_at ?? v.scheduled_start;
    const had = lastVisit.get(v.bill_to_customer_id);
    if (at && (!had || at > had)) lastVisit.set(v.bill_to_customer_id, at);
  }
  let rows = customers.map((c) => {
    const pools = properties.filter((p) => p.customer_id === c.id);
    return {
      ...c,
      properties: pools,
      hasPlan: withPlan.has(c.id),
      lastVisit: lastVisit.get(c.id) ?? null,
      created_at: (c as Customer & { created_at?: string }).created_at ?? null,
      city: pools.find((p) => p.city)?.city ?? null,
    };
  });
  if (show === "plan") rows = rows.filter((c) => c.hasPlan);
  if (show === "no_plan") rows = rows.filter((c) => !c.hasPlan);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  if (sort === "last_visit")
    rows.sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || byName(a, b));
  if (sort === "city")
    rows.sort((a, b) =>
      a.city && b.city
        ? a.city.localeCompare(b.city) || byName(a, b)
        : a.city
          ? -1
          : b.city
            ? 1
            : byName(a, b),
    );
  return rows.slice(0, 300);
}

export async function getCustomer(office: Office, id: string) {
  const supabase = await db();
  preloadTeam(office);
  // The customer, their pools, each pool's jobs and plans: one round trip instead of four.
  const row = must(
    await supabase
      .from("customer")
      .select(
        `*, properties:property!property_customer_id_company_id_fkey(*, jobs:job!job_property_id_company_id_fkey(*, bill_to:customer!job_bill_to_customer_id_company_id_fkey(*)), plans:service_plan!service_plan_property_id_company_id_fkey(*, cleanings:plan_cleaning!plan_cleaning_service_plan_id_company_id_fkey(*)))`,
      )
      .eq("company_id", office.company.id)
      .eq("id", id)
      .is("deleted_at", null)
      .is("properties.deleted_at", null)
      .is("properties.jobs.deleted_at", null)
      .is("properties.plans.deleted_at", null)
      .is("properties.plans.cleanings.deleted_at", null)
      .order("address_line1", { referencedTable: "properties" })
      .maybeSingle(),
  ) as
    | (Customer & {
        properties: (Property & {
          jobs: (Job & { bill_to: Customer | null })[];
          plans: (ServicePlan & { cleanings: PlanCleaning[] })[];
        })[];
      })
    | null;
  if (!row) return null;
  const { properties: pools, ...customer } = row;
  const properties = pools.map((p) => {
    const pool: Partial<(typeof pools)[number]> = { ...p };
    delete pool.jobs;
    delete pool.plans;
    return pool as Property;
  });
  const plans = pools
    .flatMap((p) => p.plans)
    .sort((a, b) => (a.starts_on ?? "").localeCompare(b.starts_on ?? ""));
  const jobs: EmbeddedJob[] = pools
    .flatMap((p) =>
      p.jobs.map((j) => ({
        ...j,
        property: { ...properties.find((x) => x.id === p.id)!, owner: customer as Customer },
      })),
    )
    // Newest first, unscheduled at the top.
    .sort((a, b) =>
      a.scheduled_start === b.scheduled_start
        ? 0
        : !a.scheduled_start
          ? -1
          : !b.scheduled_start
            ? 1
            : b.scheduled_start.localeCompare(a.scheduled_start),
    );
  return { customer: customer as Customer, properties, plans, jobs: await attach(office, jobs) };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Cached per request: the header, page, and panels all read the company. */
export const getCompany = cache(async (office: Office) => {
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
});

/** Whether this member can make new jobs: owners always; techs unless turned off (2026-10-18). */
export async function mayMakeJobs(office: Office): Promise<boolean> {
  if (office.isManager) return true;
  return canMakeJobs("tech", (await getCompany(office)).settings);
}

/** Cached per request, so a page can start loading it before the part that shows it. */
const listConfigCached = cache(async (office: Office, table: string): Promise<unknown[]> => {
  const supabase = await db();
  const rows = must(
    await supabase
      .from(table)
      .select("*")
      .eq("company_id", office.company.id)
      .is("deleted_at", null),
  ) as { sort_order?: number }[];
  return rows.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
});

export function listConfig<T>(office: Office, table: string): Promise<T[]> {
  return listConfigCached(office, table) as Promise<T[]>;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportRow {
  id: string;
  template_key: "homeowner" | "partner" | "maintenance";
  version: number;
  status: "draft" | "sent" | "superseded";
  final_sections: { key: string; title: string; text: string }[] | null;
  ai_draft: { problems?: { message: string; section?: string; match?: string }[] } | null;
  model: string | null;
  sent_at: string | null;
  token: string | null;
}

export const getReports = cache(async function getReports(office: Office, jobId: string) {
  const supabase = await db();
  const [reports, links, templates, messages] = await Promise.all([
    supabase
      .from("report")
      .select("id, template_key, version, status, final_sections, ai_draft, model, sent_at")
      .eq("company_id", office.company.id)
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("version", { ascending: false }),
    supabase
      .from("share_link")
      .select("token, report_id")
      .eq("job_id", jobId)
      .is("revoked_at", null),
    supabase
      .from("report_template")
      .select("key, name, enabled")
      .eq("company_id", office.company.id)
      .is("deleted_at", null),
    supabase
      .from("message")
      .select("id, channel, recipient, status, error, created_at, template")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const tokenOf = new Map(
    ((links.data ?? []) as { token: string; report_id: string | null }[]).map((l) => [
      l.report_id,
      l.token,
    ]),
  );
  return {
    reports: ((must(reports) ?? []) as Omit<ReportRow, "token">[]).map((r) => ({
      ...r,
      token: tokenOf.get(r.id) ?? null,
    })) as ReportRow[],
    templates: (templates.data ?? []) as { key: string; name: string; enabled: boolean }[],
    messages: (messages.data ?? []) as {
      id: string;
      channel: string;
      recipient: string;
      status: string;
      error: string | null;
      created_at: string;
      template: string;
    }[],
  };
});

export type { ComponentType, ExclusionReason, SeverityLevel, TestType };

// ---------------------------------------------------------------------------
// Quotes and payments
// ---------------------------------------------------------------------------

export interface QuoteRow {
  id: string;
  number: number | null;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  repair_job_id: string | null;
  lines: {
    id: string;
    description: string;
    quantity: number;
    unit_price_cents: number;
    taxable: boolean;
    finding_id: string | null;
    price_book_item_id: string | null;
  }[];
  payments: {
    id: string;
    amount_cents: number;
    method: string;
    status: string;
    paid_at: string | null;
  }[];
  token: string | null;
  repairNumber: number | null;
}

export const getQuotes = cache(async function getQuotes(
  office: Office,
  jobId: string,
): Promise<QuoteRow[]> {
  const supabase = await db();
  const quotes = must(
    await supabase
      .from("quote")
      .select(
        "id, number, status, subtotal_cents, discount_cents, tax_cents, total_cents, deposit_cents, valid_until, sent_at, accepted_at, accepted_by_name, repair_job_id",
      )
      .eq("company_id", office.company.id)
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("number", { ascending: false }),
  ) as Omit<QuoteRow, "lines" | "payments" | "token" | "repairNumber">[];
  if (quotes.length === 0) return [];
  const ids = quotes.map((q) => q.id);
  const repairIds = quotes.map((q) => q.repair_job_id).filter((x): x is string => !!x);
  const [lines, payments, links, repairs] = await Promise.all([
    supabase
      .from("quote_line_item")
      .select(
        "id, quote_id, description, quantity, unit_price_cents, taxable, finding_id, price_book_item_id, sort_order",
      )
      .in("quote_id", ids)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("payment")
      .select("id, quote_id, amount_cents, method, status, paid_at")
      .in("quote_id", ids)
      .is("deleted_at", null),
    supabase
      .from("share_link")
      .select("token, quote_id")
      .in("quote_id", ids)
      .is("revoked_at", null),
    repairIds.length
      ? supabase.from("job").select("id, number").in("id", repairIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const by = <T extends { quote_id: string | null }>(rows: T[] | null, id: string) =>
    (rows ?? []).filter((r) => r.quote_id === id);
  return quotes.map((q) => ({
    ...q,
    lines: by(must(lines) as (QuoteRow["lines"][number] & { quote_id: string })[], q.id),
    payments: by(must(payments) as (QuoteRow["payments"][number] & { quote_id: string })[], q.id),
    token:
      (must(links) as { token: string; quote_id: string }[]).find((l) => l.quote_id === q.id)
        ?.token ?? null,
    repairNumber:
      (must(repairs) as { id: string; number: number | null }[]).find(
        (j) => j.id === q.repair_job_id,
      )?.number ?? null,
  }));
});

export interface PaymentAccountState {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

/** The shop's Stripe account (owners only; techs get null). */
export const getPaymentAccount = cache(async function getPaymentAccount(
  office: Office,
): Promise<PaymentAccountState | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("stripe_account")
    .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
    .eq("company_id", office.company.id)
    .maybeSingle();
  return (data as PaymentAccountState | null) ?? null;
});

// ---------------------------------------------------------------------------
// Invoices (M9)
// ---------------------------------------------------------------------------

export interface InvoiceLineRow {
  id: string;
  kind: "item" | "deposit_credit";
  description: string;
  quantity: number;
  unit_price_cents: number;
  taxable: boolean;
  sort_order: number;
}

export interface InvoiceRow {
  id: string;
  job_id: string;
  number: number | null;
  status: InvoiceStatus;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  credit_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  notes: string | null;
  sent_at: string | null;
  paid_at: string | null;
  lines: InvoiceLineRow[];
  payments: QuoteRow["payments"];
  token: string | null;
}

const INVOICE_COLUMNS =
  "id, job_id, number, status, subtotal_cents, discount_cents, tax_cents, credit_cents, total_cents, amount_paid_cents, due_date, notes, sent_at, paid_at";

/** A job's invoices, newest first, with lines, payments, and the customer link. */
export const getInvoices = cache(async function getInvoices(
  office: Office,
  jobId: string,
): Promise<InvoiceRow[]> {
  const supabase = await db();
  const invoices = must(
    await supabase
      .from("invoice")
      .select(INVOICE_COLUMNS)
      .eq("company_id", office.company.id)
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ) as Omit<InvoiceRow, "lines" | "payments" | "token">[];
  if (invoices.length === 0) return [];
  const ids = invoices.map((i) => i.id);
  const [lines, payments, links] = await Promise.all([
    supabase
      .from("invoice_line_item")
      .select("id, invoice_id, kind, description, quantity, unit_price_cents, taxable, sort_order")
      .in("invoice_id", ids)
      .is("deleted_at", null)
      .order("sort_order"),
    supabase
      .from("payment")
      .select("id, invoice_id, amount_cents, method, status, paid_at")
      .in("invoice_id", ids)
      .is("deleted_at", null)
      .order("created_at"),
    supabase
      .from("share_link")
      .select("token, invoice_id")
      .in("invoice_id", ids)
      .is("revoked_at", null),
  ]);
  const by = <T extends { invoice_id: string | null }>(rows: T[], id: string) =>
    rows.filter((r) => r.invoice_id === id);
  return invoices.map((i) => ({
    ...i,
    lines: by(must(lines) as (InvoiceLineRow & { invoice_id: string })[], i.id).map((l) => ({
      ...l,
      quantity: Number(l.quantity),
    })),
    payments: by(must(payments) as (QuoteRow["payments"][number] & { invoice_id: string })[], i.id),
    token:
      (must(links) as { token: string; invoice_id: string }[]).find((l) => l.invoice_id === i.id)
        ?.token ?? null,
  }));
});

export interface InvoiceListRow {
  id: string;
  job_id: string;
  number: number | null;
  status: InvoiceStatus;
  total_cents: number;
  amount_paid_cents: number;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  /** First day of the month billed, for a monthly maintenance invoice. */
  period_month: string | null;
  jobNumber: number | null;
  customer: string | null;
  /** The customer's link (/i/<token>) once sent, for Copy Payment Link. */
  token: string | null;
}

/** Every invoice in the company, newest first, with its job number and customer. */
export async function listInvoices(office: Office): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const invoices = must(
    await supabase
      .from("invoice")
      .select(
        "id, job_id, number, status, total_cents, amount_paid_cents, due_date, sent_at, paid_at, period_month",
      )
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ) as Omit<InvoiceListRow, "jobNumber" | "customer" | "token">[];
  const jobIds = [...new Set(invoices.map((i) => i.job_id))];
  const [jobs, links] = await Promise.all([
    jobIds.length
      ? supabase
          .from("job")
          .select("id, number, property_id, bill_to_customer_id, status")
          .in("id", jobIds)
          .then((r) => must(r) as Job[])
      : ([] as Job[]),
    // Each sent invoice's customer link, for the list's Copy Payment Link.
    invoices.length
      ? supabase
          .from("share_link")
          .select("token, invoice_id")
          .eq("company_id", office.company.id)
          .not("invoice_id", "is", null)
          .is("revoked_at", null)
          .then((r) => (r.data ?? []) as { token: string; invoice_id: string }[])
      : [],
  ]);
  const rows = await attach(office, jobs);
  const byId = new Map(rows.map((j) => [j.id, j]));
  const tokenOf = new Map(links.map((l) => [l.invoice_id, l.token]));
  return invoices.map((i) => ({
    ...i,
    jobNumber: byId.get(i.job_id)?.number ?? null,
    customer: byId.get(i.job_id)?.customer?.name ?? null,
    token: tokenOf.get(i.id) ?? null,
  }));
}

export interface UnbilledMonth {
  /** First day of the month, YYYY-MM-01. */
  month: string;
  visits: number;
  customers: number;
  total_cents: number;
}

/** Owners: finished maintenance visits not on an invoice yet, by month. */
export async function unbilledMaintenance(office: Office): Promise<UnbilledMonth[]> {
  if (!office.isManager) return [];
  const supabase = await db();
  return must(
    await supabase.rpc("unbilled_maintenance", { target_company: office.company.id }),
  ) as UnbilledMonth[];
}

export interface SignatureRow {
  id: string;
  purpose: string;
  signer_name: string;
  signer_role: string | null;
  image_path: string | null;
  signed_at: string;
}

/** Signatures taken on a job (customer acknowledgement, work authorization, completion). */
export const getSignatures = cache(async function getSignatures(
  office: Office,
  jobId: string,
): Promise<SignatureRow[]> {
  const supabase = await db();
  return must(
    await supabase
      .from("signature")
      .select("id, purpose, signer_name, signer_role, image_path, signed_at")
      .eq("company_id", office.company.id)
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .order("signed_at"),
  ) as SignatureRow[];
});

/** Trial, paid, or read-only (M10). Null when the database doesn't have billing yet. */
export async function getAccess(office: Office): Promise<CompanyAccess | null> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("company_access", {
    target_company: office.company.id,
  });
  return error ? null : (data as CompanyAccess);
}

// ---------------------------------------------------------------------------
// Jobs › Reports (owner, 2026-10-18: "a reports tab under JOBS - that just shows you reports")
// ---------------------------------------------------------------------------

export interface ReportListRow {
  id: string;
  job_id: string;
  template_key: "homeowner" | "partner" | "maintenance";
  version: number;
  status: "draft" | "sent" | "superseded";
  sent_at: string | null;
  updated_at: string;
  job: {
    number: number | null;
    type?: string;
    bill_to: { name: string; email?: string | null } | null;
    property: { address_line1: string | null } | null;
  } | null;
  /** The customer's link (/r/<token>) once sent, for Copy Customer Link. */
  token?: string | null;
}

/** The shop's reports, newest first: current versions only (a resent report replaces its last). */
export async function listReports(
  office: Office,
  status: "all" | "sent" | "draft",
  limit = 200,
): Promise<ReportListRow[]> {
  const supabase = await db();
  let q = supabase
    .from("report")
    .select(
      "id, job_id, template_key, version, status, sent_at, updated_at, job:job!report_job_id_company_id_fkey(number, type, bill_to:customer!job_bill_to_customer_id_company_id_fkey(name, email), property:property!job_property_id_company_id_fkey(address_line1))",
    )
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .neq("status", "superseded")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const reports = must(await q) as unknown as ReportListRow[];
  // Sent reports' customer links, for the list's Copy Customer Link.
  const sent = reports.filter((r) => r.status === "sent").map((r) => r.id);
  const links = sent.length
    ? (((
        await supabase
          .from("share_link")
          .select("token, report_id")
          .eq("company_id", office.company.id)
          .not("report_id", "is", null)
          .is("revoked_at", null)
      ).data ?? []) as { token: string; report_id: string }[])
    : [];
  const tokenOf = new Map(links.map((l) => [l.report_id, l.token]));
  return reports.map((r) => ({ ...r, token: tokenOf.get(r.id) ?? null }));
}

/** A pool's chemical log, newest first (owner, 2026-10-19). */
export async function getChemicalReadings(office: Office, propertyId: string, limit = 12) {
  const supabase = await db();
  return must(
    await supabase
      .from("chemical_reading")
      .select("*")
      .eq("company_id", office.company.id)
      .eq("property_id", propertyId)
      .is("deleted_at", null)
      .order("recorded_at", { ascending: false })
      .limit(limit),
  ) as ChemicalReading[];
}

/** The pool the Chemical screen was opened for, with its customer's name. */
export async function getChemicalPool(office: Office, propertyId: string) {
  const supabase = await db();
  const row = must(
    await supabase
      .from("property")
      .select("*, customer:customer!property_customer_id_company_id_fkey(id, name)")
      .eq("company_id", office.company.id)
      .eq("id", propertyId)
      .is("deleted_at", null)
      .maybeSingle(),
  ) as (Property & { customer: { id: string; name: string } | null }) | null;
  return row;
}

/** Scheduled cleanings on these plans, with their checklist item (owner, 2026-10-19). */
export async function getPlanCleanings(office: Office, planIds: string[]) {
  if (planIds.length === 0) return [];
  const supabase = await db();
  return must(
    await supabase
      .from("plan_cleaning")
      .select("*, type:component_type!plan_cleaning_component_type_id_company_id_fkey(key, name)")
      .eq("company_id", office.company.id)
      .in("service_plan_id", planIds)
      .is("deleted_at", null),
  ) as (PlanCleaning & { type: { key: string; name: string } | null })[];
}

/**
 * The scheduled cleanings on these visits (filter, salt cell, filter replacement: the
 * checklist items a plan's cleaning put there, `plan_cleaning_id`), by job, so Schedule shows
 * them on the date they're due (owner, 2026-10-20: "The filter/salt cells don't show up on the
 * dates they're due"). The database puts each one on the first visit on or after its due date.
 */
export async function visitCleanings(
  office: Office,
  jobIds: string[],
): Promise<Map<string, { kind: CleaningKind; name: string; planCleaningId: string }[]>> {
  const out = new Map<string, { kind: CleaningKind; name: string; planCleaningId: string }[]>();
  if (!jobIds.length) return out;
  const supabase = await db();
  const { data } = await supabase
    .from("job_component")
    .select(
      "job_id, plan_cleaning_id, type:component_type!job_component_component_type_id_company_id_fkey(key, name)",
    )
    .eq("company_id", office.company.id)
    .in("job_id", jobIds)
    .not("plan_cleaning_id", "is", null)
    .is("deleted_at", null);
  for (const row of (data ?? []) as unknown as {
    job_id: string;
    plan_cleaning_id: string;
    type: { key: string; name: string } | null;
  }[]) {
    if (!row.type) continue;
    const list = out.get(row.job_id) ?? [];
    list.push({
      kind: cleaningKind(row.type),
      name: row.type.name,
      planCleaningId: row.plan_cleaning_id,
    });
    out.set(row.job_id, list);
  }
  return out;
}
