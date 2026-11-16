import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  issueConversion,
  issueNotification,
  planComponents,
  uuidv7,
  type ComponentType,
  type IssueMedia,
  type IssueWork,
  type ServiceIssue,
} from "@leakbook/core";

// Service issues on the server (docs/design/2026-11-16-service-issues.md): making a job of one
// (the website's Make Quote and Make Leak Detection Job), and telling the owners and admins about
// new ones. The phones write the same rows offline through the sync layer (core issueConversion).

type Db = Pick<SupabaseClient, "from" | "rpc">;

/** A refusal to show the person as it is. */
export class IssueError extends Error {}

/**
 * Makes a job of an open issue, as the signed-in manager (row security applies): the job for the
 * issue's pool and customer (a repair job has no checklist; leak detection gets the pool's), then
 * the issue converted to it, then its photos and videos copied onto the job. Returns the job.
 */
export async function convertIssueWith(
  db: Db,
  input: { companyId: string; issueId: string; type: IssueWork; userId: string; now?: string },
): Promise<string> {
  const { data: found } = await db
    .from("service_issue")
    .select("id, customer_id, property_id, job_id, description, status")
    .eq("id", input.issueId)
    .eq("company_id", input.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const issue = found as Pick<
    ServiceIssue,
    "id" | "customer_id" | "property_id" | "job_id" | "description" | "status"
  > | null;
  if (!issue) throw new IssueError("Issue not found.");
  if (issue.status !== "open") throw new IssueError("This issue isn’t open anymore.");

  const { data: media } = issue.job_id
    ? await db
        .from("media")
        .select("*")
        .eq("service_issue_id", issue.id)
        .eq("job_id", issue.job_id)
        .is("deleted_at", null)
    : { data: [] };

  // Leak detection starts with the pool's checklist, as New Job does.
  let components: ReturnType<typeof planComponents> = [];
  if (input.type === "detection") {
    const [{ data: types }, { data: pool }] = await Promise.all([
      db
        .from("component_type")
        .select("*")
        .eq("company_id", input.companyId)
        .is("deleted_at", null),
      db.from("property").select("has_spa, pool_type").eq("id", issue.property_id).maybeSingle(),
    ]);
    const p = (pool ?? { has_spa: false, pool_type: null }) as {
      has_spa: boolean;
      pool_type: string | null;
    };
    components = planComponents(
      (types ?? []) as ComponentType[],
      { has_pool: true, has_spa: p.has_spa, pool_type: p.pool_type } as Parameters<
        typeof planComponents
      >[1],
      "detection",
    );
  }

  const plan = issueConversion({
    issue,
    media: (media ?? []) as IssueMedia[],
    type: input.type,
    jobId: "",
    userId: input.userId,
    now: input.now ?? new Date().toISOString(),
    newId: () => uuidv7(),
  });
  const { data: jobId, error } = await db.rpc("create_job", {
    target_company: input.companyId,
    new_customer: null,
    existing_customer: issue.customer_id,
    new_property: null,
    existing_property: issue.property_id,
    job: plan.job,
    components,
  });
  if (error || !jobId) throw new Error(error?.message ?? "Couldn’t make the job.");
  const job = jobId as string;

  const { error: issueError } = await db
    .from("service_issue")
    .update({ ...plan.issue, converted_job_id: job })
    .eq("id", issue.id)
    .eq("company_id", input.companyId);
  if (issueError) throw new Error(issueError.message);

  if (plan.media.length) {
    const { error: mediaError } = await db
      .from("media")
      .insert(plan.media.map((m) => ({ ...m, job_id: job, company_id: input.companyId })));
    if (mediaError) throw new Error(mediaError.message);
  }
  return job;
}

/**
 * Tells the owners and admins (not the reporter) about issues the server hasn't announced yet,
 * each once: the row is claimed first (notified_at), so a phone asking twice, or the website and
 * a phone together, notify once. Takes the service-role client. Returns how many were claimed.
 */
export async function notifyIssuesWith(
  db: Db,
  send: (input: {
    userIds: string[];
    text: { title: string; body: string };
    data: object;
  }) => Promise<unknown>,
  input: { companyId: string; ids: string[] },
): Promise<number> {
  const ids = [...new Set(input.ids)].slice(0, 50);
  if (ids.length === 0) return 0;
  const { data: claimed } = await db
    .from("service_issue")
    .update({ notified_at: new Date().toISOString() })
    .in("id", ids)
    .eq("company_id", input.companyId)
    .is("notified_at", null)
    .is("deleted_at", null)
    .select("id, customer_id, job_id, description, reported_by");
  const rows = (claimed ?? []) as {
    id: string;
    customer_id: string;
    job_id: string | null;
    description: string;
    reported_by: string | null;
  }[];
  if (rows.length === 0) return 0;
  const [{ data: managers }, { data: customers }] = await Promise.all([
    db
      .from("membership")
      .select("user_id")
      .eq("company_id", input.companyId)
      .in("role", ["owner", "admin"])
      .eq("status", "active")
      .is("deleted_at", null),
    db
      .from("customer")
      .select("id, name")
      .in(
        "id",
        rows.map((r) => r.customer_id),
      ),
  ]);
  const names = new Map(
    ((customers ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name]),
  );
  const people = ((managers ?? []) as { user_id: string }[]).map((m) => m.user_id);
  for (const r of rows) {
    await send({
      userIds: people.filter((p) => p !== r.reported_by),
      text: issueNotification(names.get(r.customer_id)?.trim() || "A customer", r.description),
      data: { issue: r.id, ...(r.job_id ? { job: r.job_id } : {}) },
    });
  }
  return rows.length;
}
