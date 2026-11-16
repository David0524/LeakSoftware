import "server-only";
import {
  formatAddress,
  issueList,
  issueMediaOf,
  type IssueFilter,
  type Media,
  type Property,
  type ServiceIssue,
} from "@leakbook/core";
import type { Office } from "./auth";
import { getTeam, signedMediaUrls } from "./data";
import { createClient } from "./supabase/server";
import { isUuid } from "./uuid";

// Service issues for the office (docs/design/2026-11-16-service-issues.md). Read as the signed-in
// member (row security: a tech who sees only their own jobs sees the issues they reported and
// those on their jobs); techs' lists show the ones they reported (core issueList).

export interface IssueRow extends ServiceIssue {
  customer: { id: string; name: string | null } | null;
  property: Pick<
    Property,
    "id" | "address_line1" | "address_line2" | "city" | "state" | "postal_code"
  > | null;
  reporter: string | null;
  address: string | null;
}

const SELECT =
  "*, customer:customer!service_issue_customer_id_company_id_fkey(id, name), property:property!service_issue_property_id_company_id_fkey(id, address_line1, address_line2, city, state, postal_code)";

async function named(office: Office, rows: Omit<IssueRow, "reporter" | "address">[]) {
  const team = await getTeam(office);
  const names = new Map(team.map((m) => [m.user_id, m.name]));
  return rows.map((r) => ({
    ...r,
    reporter: r.reported_by ? (names.get(r.reported_by) ?? null) : null,
    address: r.property ? formatAddress(r.property as Property) : null,
  }));
}

const viewer = (office: Office) => ({ userId: office.user.id, role: office.company.role });

/** Jobs › Issues: the filter's issues, newest first (500 at most). */
export async function listIssues(office: Office, filter: IssueFilter): Promise<IssueRow[]> {
  const db = await createClient();
  let q = db
    .from("service_issue")
    .select(SELECT)
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .order("reported_at", { ascending: false })
    .limit(500);
  if (filter === "open") q = q.eq("status", "open");
  else if (filter === "resolved") q = q.neq("status", "open");
  const { data } = await q;
  const rows = issueList(
    (data ?? []) as Omit<IssueRow, "reporter" | "address">[],
    filter,
    viewer(office),
  );
  return named(office, rows);
}

/** The open issues the Issues segment counts for this person. */
export async function openIssues(office: Office): Promise<number> {
  const db = await createClient();
  const { data } = await db
    .from("service_issue")
    .select("id, status, reported_by, reported_at")
    .eq("company_id", office.company.id)
    .eq("status", "open")
    .is("deleted_at", null)
    .limit(1000);
  return issueList((data ?? []) as ServiceIssue[], "open", viewer(office)).length;
}

/** One issue, with its photos and videos (short-lived links) and the job it became. */
export async function getIssue(office: Office, id: string) {
  if (!isUuid(id)) return null;
  const db = await createClient();
  const { data } = await db
    .from("service_issue")
    .select(SELECT)
    .eq("company_id", office.company.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const [issue] = await named(office, [data as Omit<IssueRow, "reporter" | "address">]);
  const [{ data: media }, { data: jobs }] = await Promise.all([
    issue!.job_id
      ? db
          .from("media")
          .select("*")
          .eq("service_issue_id", id)
          .eq("job_id", issue!.job_id)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    db
      .from("job")
      .select("id, number, type")
      .in(
        "id",
        [issue!.job_id, issue!.converted_job_id].filter((x): x is string => !!x),
      ),
  ]);
  const photos = issueMediaOf(
    (media ?? []) as (Media & { service_issue_id: string; deleted_at: string | null })[],
    issue!,
  );
  const urls = await signedMediaUrls(
    photos
      .filter((m) => m.upload_state === "uploaded" && m.storage_path)
      .map((m) => m.storage_path!),
  );
  const jobById = new Map(
    ((jobs ?? []) as { id: string; number: number | null; type: string }[]).map((j) => [j.id, j]),
  );
  return {
    issue: issue!,
    media: photos.map((m) => ({
      ...m,
      url: m.storage_path ? (urls.get(m.storage_path) ?? null) : null,
    })),
    visit: issue!.job_id ? (jobById.get(issue!.job_id) ?? null) : null,
    madeJob: issue!.converted_job_id ? (jobById.get(issue!.converted_job_id) ?? null) : null,
  };
}

/** Issues reported on a job (its Issues group), newest first. */
export async function jobIssues(office: Office, jobId: string): Promise<IssueRow[]> {
  if (!isUuid(jobId)) return [];
  const db = await createClient();
  const { data } = await db
    .from("service_issue")
    .select(SELECT)
    .eq("company_id", office.company.id)
    .eq("job_id", jobId)
    .is("deleted_at", null)
    .order("reported_at", { ascending: false });
  return named(office, (data ?? []) as Omit<IssueRow, "reporter" | "address">[]);
}

/** A customer's open issues (their page). */
export async function customerIssues(office: Office, customerId: string): Promise<IssueRow[]> {
  if (!isUuid(customerId)) return [];
  const db = await createClient();
  const { data } = await db
    .from("service_issue")
    .select(SELECT)
    .eq("company_id", office.company.id)
    .eq("customer_id", customerId)
    .eq("status", "open")
    .is("deleted_at", null)
    .order("reported_at", { ascending: false });
  return named(office, (data ?? []) as Omit<IssueRow, "reporter" | "address">[]);
}
