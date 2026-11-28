import { jobBusinessName, type BusinessCompany, type BusinessJob } from "@leakbook/core";
import type { Row } from "@leakbook/sync";
import { getServices } from "./services";

// The name a job's customer sees: the shop's main business or its second one
// (docs/design/2026-11-26-second-business-and-tech-photos.md; core business.ts). The job and
// company rows are synced; a repair follows the job it came from (parent_job_id), read here from
// the phone's database.

/** The job columns the rules read, as synced (the core Job type doesn't list them all). */
type JobLike = { type: string; business?: string | null; parent_job_id?: string | null };

/** The job a repair came from, from the phone's database, if any. */
export function parentJobOf(job: object | null | undefined): BusinessJob | null {
  const parentId = (job as JobLike | null | undefined)?.parent_job_id;
  if (!parentId) return null;
  const parent = getServices().sync.get<Row>("job", parentId) as unknown as JobLike | undefined;
  return parent ?? null;
}

/** The business name for a job's customer texts; the main name without a job. */
export function businessNameFor(company: BusinessCompany, job: object | null | undefined): string {
  if (!job) return company.name;
  return jobBusinessName(company, job as JobLike, parentJobOf(job));
}

/** The same, from a job's id (an invoice's job_id); the main name without one. */
export function businessNameForJobId(
  company: BusinessCompany,
  jobId: string | null | undefined,
): string {
  return businessNameFor(company, jobId ? getServices().sync.get<Row>("job", jobId) : null);
}
