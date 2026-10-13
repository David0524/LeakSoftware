import "server-only";
import type {
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
  secondTechName: string | null;
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
      secondTechName: j.second_tech_id ? (techById.get(j.second_tech_id) ?? "Teammate") : null,
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

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportRow {
  id: string;
  template_key: "homeowner" | "partner" | "insurance";
  version: number;
  status: "draft" | "sent" | "superseded";
  final_sections: { key: string; title: string; text: string }[] | null;
  ai_draft: { problems?: { message: string; section?: string; match?: string }[] } | null;
  model: string | null;
  sent_at: string | null;
  token: string | null;
}

export async function getReports(office: Office, jobId: string) {
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
}

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

export async function getQuotes(office: Office, jobId: string): Promise<QuoteRow[]> {
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
}

export interface PaymentAccountState {
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

/** The shop's Stripe account (owners only; techs get null). */
export async function getPaymentAccount(office: Office): Promise<PaymentAccountState | null> {
  const supabase = await db();
  const { data } = await supabase
    .from("stripe_account")
    .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
    .eq("company_id", office.company.id)
    .maybeSingle();
  return (data as PaymentAccountState | null) ?? null;
}

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
export async function getInvoices(office: Office, jobId: string): Promise<InvoiceRow[]> {
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
}

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
  jobNumber: number | null;
  customer: string | null;
}

/** Every invoice in the company, newest first, with its job number and customer. */
export async function listInvoices(office: Office): Promise<InvoiceListRow[]> {
  const supabase = await db();
  const invoices = must(
    await supabase
      .from("invoice")
      .select(
        "id, job_id, number, status, total_cents, amount_paid_cents, due_date, sent_at, paid_at",
      )
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ) as Omit<InvoiceListRow, "jobNumber" | "customer">[];
  const jobIds = [...new Set(invoices.map((i) => i.job_id))];
  const jobs = jobIds.length
    ? (must(
        await supabase
          .from("job")
          .select("id, number, property_id, bill_to_customer_id, status")
          .in("id", jobIds),
      ) as Job[])
    : [];
  const rows = await attach(office, jobs);
  const byId = new Map(rows.map((j) => [j.id, j]));
  return invoices.map((i) => ({
    ...i,
    jobNumber: byId.get(i.job_id)?.number ?? null,
    customer: byId.get(i.job_id)?.customer?.name ?? null,
  }));
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
export async function getSignatures(office: Office, jobId: string): Promise<SignatureRow[]> {
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
}

export interface WarrantyRow {
  id: string;
  description: string;
  starts_on: string;
  ends_on: string;
  terms: string | null;
  job: JobRow | null;
}

/** The shop's warranties, soonest to end first, with the repair job's customer and pool. */
export async function getWarranties(office: Office): Promise<WarrantyRow[]> {
  const supabase = await db();
  const rows = must(
    await supabase
      .from("warranty")
      .select("id, description, starts_on, ends_on, terms, repair_job_id")
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .order("ends_on"),
  ) as (Omit<WarrantyRow, "job"> & { repair_job_id: string })[];
  const jobIds = [...new Set(rows.map((r) => r.repair_job_id))];
  const jobs = jobIds.length
    ? await attach(office, must(await supabase.from("job").select("*").in("id", jobIds)) as Job[])
    : [];
  const byId = new Map(jobs.map((j) => [j.id, j]));
  return rows.map(({ repair_job_id, ...r }) => ({ ...r, job: byId.get(repair_job_id) ?? null }));
}

/** Trial, paid, or read-only (M10). Null when the database doesn't have billing yet. */
export async function getAccess(office: Office): Promise<CompanyAccess | null> {
  const supabase = await db();
  const { data, error } = await supabase.rpc("company_access", {
    target_company: office.company.id,
  });
  return error ? null : (data as CompanyAccess);
}
