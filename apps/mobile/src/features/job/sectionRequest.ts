/**
 * A screen opened from a job asks the job page to show one of its parts once it's back in
 * front (the signing screen's Go to Checklist). The job page takes the request when it's
 * focused again.
 */
export type RequestedJobSection = "checklist" | "wrapup";

const requested = new Map<string, RequestedJobSection>();

export function requestJobSection(jobId: string, section: RequestedJobSection) {
  requested.set(jobId, section);
}

/** The part asked for, once. */
export function takeJobSection(jobId: string): RequestedJobSection | undefined {
  const section = requested.get(jobId);
  requested.delete(jobId);
  return section;
}
