// Finish Report, Send by Email and Send by Text tapped offline (owner, 2026-10-20: one-handed
// use, item 6): the request waits on the phone and runs once there's a signal and the job's
// changes are on the server. The list itself, kept free of the app's services so it's tested.

export type ReportRequestKind = "finish" | "email" | "text";

export interface ReportRequest {
  kind: ReportRequestKind;
  reportId: string;
  jobId: string;
  /** Email address (email) or phone number (text). */
  to: string | null;
}

/** Adds a request; the same request for the same report replaces the earlier one. */
export function addRequest(queue: ReportRequest[], req: ReportRequest): ReportRequest[] {
  return [...queue.filter((r) => !sameRequest(r, req)), req];
}

export function removeRequest(queue: ReportRequest[], req: ReportRequest): ReportRequest[] {
  return queue.filter((r) => !sameRequest(r, req));
}

function sameRequest(a: ReportRequest, b: ReportRequest): boolean {
  return a.kind === b.kind && a.reportId === b.reportId;
}

/** A stored queue, read defensively (anything unexpected is dropped). */
export function parseRequests(raw: string | null): ReportRequest[] {
  try {
    const v = JSON.parse(raw ?? "[]") as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (r): r is ReportRequest =>
        !!r &&
        typeof r === "object" &&
        ["finish", "email", "text"].includes((r as ReportRequest).kind) &&
        typeof (r as ReportRequest).reportId === "string" &&
        typeof (r as ReportRequest).jobId === "string",
    );
  } catch {
    return [];
  }
}

/** The line shown while a request waits (the same words for each). */
export const QUEUED_MESSAGE = "Will send when you’re back online.";
