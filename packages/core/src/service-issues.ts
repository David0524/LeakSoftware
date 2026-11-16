import { isManagerRole, type Services } from "./models";

/**
 * Service issues (docs/design/2026-11-16-service-issues.md): a tech on a visit reports a problem
 * (a leaking pump, a cracked skimmer, a possible leak) with a few words and photos; the office
 * resolves it or makes a job of it (Make Quote: a repair job to quote; Make Leak Detection Job).
 * The rows and the words every platform shares live here (Swift twin: SundeckCore/
 * ServiceIssues.swift).
 */

export type IssueStatus = "open" | "resolved" | "converted";
/** The work a tech suggests: job types. Null is "Not sure". */
export type IssueWork = "repair" | "detection";

export interface ServiceIssue {
  id: string;
  company_id: string;
  customer_id: string;
  property_id: string;
  job_id: string | null;
  description: string;
  suggested_type: IssueWork | null;
  status: IssueStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  converted_job_id: string | null;
  reported_by: string | null;
  reported_at: string;
  deleted_at?: string | null;
}

export const ISSUE_DESCRIPTION_MAX = 2000;
export const ISSUE_NOTE_MAX = 1000;

/** The words, the same on every platform. */
export const ISSUE_TEXT = {
  report: "Report an Issue",
  sheetTitle: "Report an Issue",
  whatsWrong: "What’s wrong?",
  placeholder: "Leaking pump seal, cracked skimmer, heater won’t light…",
  suggestedWork: "Suggested Work",
  submit: "Report",
  reported: "Issue reported. The office will see it.",
  addPhotosFirst: "Say what’s wrong first, then add photos.",
  segment: "Issues",
  makeQuote: "Make Quote",
  makeDetection: "Make Leak Detection Job",
  resolve: "Resolve",
  resolveTitle: "Resolve Issue",
  resolveNote: "Note (optional)",
  resolveNotePlaceholder: "Fixed on the visit, customer declined…",
  reopen: "Reopen",
  openJob: "Open Job",
  onlyManagers: "Owners and admins resolve issues and make jobs from them.",
} as const;

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: "Open",
  resolved: "Resolved",
  converted: "Job made",
};

/** Suggested Work's segments, in order: Not Sure, Repair, and Leak Detection where the shop does it. */
export function issueWorkOptions(services: Services): { value: IssueWork | null; label: string }[] {
  return [
    { value: null, label: "Not Sure" },
    { value: "repair", label: "Repair" },
    ...(services !== "pool" ? [{ value: "detection" as const, label: "Leak Detection" }] : []),
  ];
}

export const ISSUE_WORK_LABELS: Record<IssueWork, string> = {
  repair: "Repair",
  detection: "Leak Detection",
};

/** What's wrong is required and fits: the message to show, or null. */
export function issueDescriptionError(text: string): string | null {
  const t = text.trim();
  if (!t) return "Say what’s wrong.";
  if (t.length > ISSUE_DESCRIPTION_MAX)
    return `Keep it under ${ISSUE_DESCRIPTION_MAX.toLocaleString("en-US")} characters.`;
  return null;
}

export function issueNoteError(text: string): string | null {
  return text.trim().length > ISSUE_NOTE_MAX
    ? `Keep the note under ${ISSUE_NOTE_MAX.toLocaleString("en-US")} characters.`
    : null;
}

/**
 * The new issue's row (the client-writable insert columns), for a visit's customer and pool. The
 * reporter is written so the phone lists it as theirs at once (the server sets it anyway).
 */
export function reportIssueRow(input: {
  customerId: string;
  propertyId: string;
  jobId: string | null;
  description: string;
  suggested: IssueWork | null;
  userId: string;
  now: string;
}): {
  customer_id: string;
  property_id: string;
  job_id: string | null;
  description: string;
  suggested_type: IssueWork | null;
  reported_by: string;
  reported_at: string;
} {
  return {
    customer_id: input.customerId,
    property_id: input.propertyId,
    job_id: input.jobId,
    description: input.description.trim(),
    suggested_type: input.suggested,
    reported_by: input.userId,
    reported_at: input.now,
  };
}

/** Only owners and admins resolve, reopen, and make jobs of issues (the database agrees). */
export function canManageIssues(role: string | null | undefined): boolean {
  return isManagerRole(role);
}

/** Resolve, with an optional note. */
export function resolveIssueWrite(userId: string, note: string, now: string) {
  return {
    status: "resolved" as const,
    resolution_note: note.trim() || null,
    resolved_by: userId,
    resolved_at: now,
  };
}

/** Reopen a resolved issue (one that became a job keeps it). */
export function reopenIssueWrite() {
  return {
    status: "open" as const,
    resolution_note: null,
    resolved_by: null,
    resolved_at: null,
  };
}

/** The actions an issue offers this person. */
export function issueActions(
  issue: Pick<ServiceIssue, "status">,
  role: string | null | undefined,
  services: Services,
): ("make_quote" | "make_detection" | "resolve" | "reopen" | "open_job")[] {
  if (issue.status === "converted") return ["open_job"];
  if (!canManageIssues(role)) return [];
  if (issue.status === "resolved") return ["reopen"];
  return ["make_quote", ...(services !== "pool" ? (["make_detection"] as const) : []), "resolve"];
}

/** The columns of a photo or video the copy onto the new job keeps (the same file). */
const COPIED_MEDIA = [
  "kind",
  "storage_path",
  "upload_state",
  "mime_type",
  "size_bytes",
  "sha256",
  "width",
  "height",
  "duration_ms",
  "captured_at",
  "latitude",
  "longitude",
  "markup",
  "caption",
] as const;

/** What reading an issue's photos and videos needs of a media row. */
export interface IssueMedia {
  id: string;
  job_id: string;
  service_issue_id?: string | null;
  deleted_at?: string | null;
  captured_at?: string | null;
  created_at?: string | null;
}

/**
 * Make Quote (a repair job) or Make Leak Detection Job, as rows written in this order: the job
 * (unscheduled, for the issue's pool and customer, the description as its notes), the issue
 * (converted to it), then a copy of each of the issue's photos and videos on the new job (the
 * same file; the server marks a copy uploaded with its original). `newId` makes each copy's id.
 */
export function issueConversion(input: {
  issue: Pick<ServiceIssue, "id" | "customer_id" | "property_id" | "job_id" | "description">;
  media: IssueMedia[];
  type: IssueWork;
  jobId: string;
  userId: string;
  now: string;
  newId: () => string;
}): {
  job: {
    type: IssueWork;
    property_id: string;
    bill_to_customer_id: string;
    status: "unscheduled";
    summary_notes: string;
  };
  issue: {
    status: "converted";
    converted_job_id: string;
    resolved_by: string;
    resolved_at: string;
  };
  media: Record<string, unknown>[];
} {
  const originals = issueMediaOf(input.media, input.issue);
  return {
    job: {
      type: input.type,
      property_id: input.issue.property_id,
      bill_to_customer_id: input.issue.customer_id,
      status: "unscheduled",
      summary_notes: input.issue.description.trim(),
    },
    issue: {
      status: "converted",
      converted_job_id: input.jobId,
      resolved_by: input.userId,
      resolved_at: input.now,
    },
    media: originals.map((m) => {
      const row: Record<string, unknown> = {
        id: input.newId(),
        job_id: input.jobId,
        service_issue_id: input.issue.id,
      };
      for (const k of COPIED_MEDIA) row[k] = (m as unknown as Record<string, unknown>)[k] ?? null;
      return row;
    }),
  };
}

/** An issue's own photos and videos: on its visit, not removed, oldest first. */
export function issueMediaOf<T extends IssueMedia>(
  media: T[],
  issue: Pick<ServiceIssue, "id" | "job_id">,
): T[] {
  return media
    .filter((m) => m.service_issue_id === issue.id && m.job_id === issue.job_id && !m.deleted_at)
    .sort((a, b) =>
      (a.captured_at ?? a.created_at ?? "").localeCompare(b.captured_at ?? b.created_at ?? ""),
    );
}

export type IssueFilter = "open" | "resolved" | "all";

export const ISSUE_FILTERS: { key: IssueFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Done" },
  { key: "all", label: "All" },
];

/**
 * The Issues list: live issues for the filter ("Done" is resolved or made a job), newest first.
 * A tech who can't manage issues sees the ones they reported.
 */
export function issueList<
  T extends Pick<ServiceIssue, "status" | "reported_at" | "reported_by" | "id"> & {
    deleted_at?: string | null;
  },
>(
  issues: T[],
  filter: IssueFilter,
  viewer: { userId: string; role: string | null | undefined },
): T[] {
  return issues
    .filter((i) => !i.deleted_at)
    .filter((i) => canManageIssues(viewer.role) || i.reported_by === viewer.userId)
    .filter((i) =>
      filter === "all" ? true : filter === "open" ? i.status === "open" : i.status !== "open",
    )
    .sort((a, b) => b.reported_at.localeCompare(a.reported_at) || b.id.localeCompare(a.id));
}

/** How many open issues the Issues segment counts (for this viewer). */
export function openIssueCount(
  issues: Pick<ServiceIssue, "status" | "reported_by" | "reported_at" | "id">[],
  viewer: { userId: string; role: string | null | undefined },
): number {
  return issueList(issues, "open", viewer).length;
}

/** "Issues" or "Issues (3)" on the segment. */
export function issuesSegmentLabel(open: number): string {
  return open > 0 ? `${ISSUE_TEXT.segment} (${open})` : ISSUE_TEXT.segment;
}

/** What an empty Issues list says. */
export function issuesEmpty(filter: IssueFilter, manages: boolean): string {
  if (filter === "open")
    return manages
      ? "No open issues. Techs report them from a visit with Report an Issue."
      : "No open issues you reported. Report one from a visit with Report an Issue.";
  if (filter === "resolved") return "No resolved issues yet.";
  return "No issues yet.";
}

/** The line under an issue in lists: "Repair · Sam Ortiz · Nov 16". */
export function issueDetailLine(input: {
  suggested: IssueWork | null;
  reporter: string | null;
  reportedOn: string;
}): string {
  return [
    input.suggested ? ISSUE_WORK_LABELS[input.suggested] : null,
    input.reporter,
    input.reportedOn,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The first line of the description, cut for a list row or a notification. */
export function issueTitle(description: string, max = 80): string {
  const line = description.trim().split(/\r?\n/)[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
