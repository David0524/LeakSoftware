import {
  hasSecondBusiness,
  jobBusinessName,
  type BusinessCompany,
  type BusinessJob,
} from "@leakbook/core";
import type { SupabaseClient } from "@supabase/supabase-js";

// The name each job's customer sees (2026-11-26, core business.ts): the shop's own, or its
// second business's. A repair follows the job it came from, so those are read in one query.

type NamedJob = BusinessJob & { id: string; parent_job_id?: string | null };

export async function jobBusinessNames(
  db: SupabaseClient,
  company: BusinessCompany,
  jobs: NamedJob[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!hasSecondBusiness(company)) {
    for (const j of jobs) names.set(j.id, company.name);
    return names;
  }
  const parentIds = [
    ...new Set(
      jobs
        .filter((j) => j.type === "repair" && !j.business && j.parent_job_id)
        .map((j) => j.parent_job_id!),
    ),
  ];
  const parents = new Map<string, BusinessJob>();
  if (parentIds.length) {
    const { data } = await db.from("job").select("id, type, business").in("id", parentIds);
    for (const p of (data ?? []) as (BusinessJob & { id: string })[]) parents.set(p.id, p);
  }
  for (const j of jobs)
    names.set(
      j.id,
      jobBusinessName(company, j, j.parent_job_id ? parents.get(j.parent_job_id) : null),
    );
  return names;
}

/** One job's business name, from its id (the quote send route). */
export async function jobBusinessNameById(
  db: SupabaseClient,
  jobId: string,
): Promise<string | null> {
  const { data: job } = await db
    .from("job")
    .select("id, type, business, parent_job_id, company:company_id(*)")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return null;
  const { company, ...rest } = job as unknown as NamedJob & { company: BusinessCompany | null };
  if (!company) return null;
  return (await jobBusinessNames(db, company, [rest])).get(rest.id) ?? company.name;
}
