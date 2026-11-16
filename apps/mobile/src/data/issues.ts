import { useMemo } from "react";
import {
  issueConversion,
  issueMediaOf,
  reopenIssueWrite,
  reportIssueRow,
  resolveIssueWrite,
  uuidv7,
  type ComponentType,
  type IssueWork,
  type Media,
  type Property,
  type ServiceIssue,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { call } from "./reports";
import { createChecklist } from "./inspection";
import { useJobRows, useRows } from "./hooks";
import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";
import type { SyncService } from "../lib/sync-service";

// Service issues on the phone (docs/design/2026-11-16-service-issues.md), as the website's: a
// tech reports a problem on a visit (Report an Issue), the office resolves it or makes a job of it.
// Every write is a row + outbox through the sync layer, so it all works offline. The owners and
// admins hear about a report once it has reached the server (flushIssueNotices).

type Values = Record<string, JsonValue>;

/** The shop's issues (removed ones left out). */
export function useIssues(companyId: string): ServiceIssue[] {
  const rows = useRows<ServiceIssue>("service_issue", companyId);
  return useMemo(() => rows.filter((r) => !r.deleted_at), [rows]);
}

/** Issues reported on a job, newest first. */
export function useJobIssues(companyId: string, jobId: string): ServiceIssue[] {
  const rows = useJobRows<ServiceIssue>("service_issue", companyId, jobId);
  return useMemo(
    () =>
      rows
        .filter((r) => !r.deleted_at && r.job_id === jobId)
        .sort((a, b) => b.reported_at.localeCompare(a.reported_at)),
    [rows, jobId],
  );
}

/** An issue's own photos and videos (on the visit it was reported on). */
export function useIssueMedia(companyId: string, issue: ServiceIssue | undefined): Media[] {
  const rows = useJobRows<Media & { service_issue_id?: string | null; deleted_at?: string | null }>(
    "media",
    companyId,
    issue?.job_id ?? "",
  );
  return useMemo(() => (issue ? issueMediaOf(rows, issue) : []), [rows, issue]);
}

/**
 * Report an Issue: saves it (open, by this person) and returns its id. Saved before its photos,
 * which link to it.
 */
export function saveIssue(
  companyId: string,
  input: {
    id?: string;
    customerId: string;
    propertyId: string;
    jobId: string;
    description: string;
    suggested: IssueWork | null;
    userId: string;
  },
): string {
  const { sync } = getServices();
  const id = input.id ?? uuidv7();
  const row = reportIssueRow({ ...input, now: new Date().toISOString() });
  if (sync.get("service_issue", id)) {
    sync.write("service_issue", id, companyId, {
      description: row.description,
      suggested_type: row.suggested_type,
    });
  } else {
    sync.write("service_issue", id, companyId, row as unknown as Values);
  }
  return id;
}

export function resolveIssue(companyId: string, id: string, userId: string, note: string) {
  getServices().sync.write(
    "service_issue",
    id,
    companyId,
    resolveIssueWrite(userId, note, new Date().toISOString()) as unknown as Values,
  );
}

export function reopenIssue(companyId: string, id: string) {
  getServices().sync.write("service_issue", id, companyId, reopenIssueWrite() as Values);
}

/**
 * Make Quote (a repair job) or Make Leak Detection Job, in one save: the job for the issue's pool
 * and customer, the issue converted to it, its photos and videos copied onto the job (the same
 * files), and, for leak detection, the pool's checklist. Returns the job's id.
 */
export function convertIssue(
  sync: SyncService,
  companyId: string,
  input: {
    issue: ServiceIssue;
    media: Media[];
    type: IssueWork;
    userId: string;
    componentTypes: ComponentType[];
    pool: Pick<Property, "has_spa" | "pool_type"> | undefined;
  },
): string {
  const jobId = uuidv7();
  const plan = issueConversion({
    issue: input.issue,
    media: input.media,
    type: input.type,
    jobId,
    userId: input.userId,
    now: new Date().toISOString(),
    newId: () => uuidv7(),
  });
  sync.batch(() => {
    sync.write("job", jobId, companyId, plan.job as unknown as Values);
    sync.write("service_issue", input.issue.id, companyId, plan.issue as unknown as Values);
    for (const m of plan.media) {
      const { id, ...values } = m;
      sync.write("media", id as string, companyId, values as Values);
    }
    if (input.type === "detection")
      createChecklist(
        sync,
        companyId,
        jobId,
        input.componentTypes,
        {
          has_pool: true,
          has_spa: input.pool?.has_spa ?? false,
          pool_type: input.pool?.pool_type ?? null,
        },
        "detection",
      );
  });
  return jobId;
}

let running = false;

/**
 * After a sync: issues this person reported that reached the server but haven't been announced
 * yet go to /api/issues/notify, which tells the owners and admins once. Never throws.
 */
export async function flushIssueNotices(companyId: string, userId: string): Promise<void> {
  if (running || !API_URL) return;
  const { sync } = getServices();
  const waiting = (
    sync.list("service_issue", companyId) as unknown as (ServiceIssue & {
      notified_at?: string | null;
    })[]
  )
    .filter(
      (r) =>
        r.reported_by === userId &&
        !r.notified_at &&
        !r.deleted_at &&
        !sync.hasPendingWrites("service_issue", r.id) &&
        // Its photos first, so the office sees them with it.
        !(r.job_id && sync.hasPendingUploads(r.job_id)),
    )
    .map((r) => r.id);
  if (waiting.length === 0) return;
  running = true;
  try {
    await call("/api/issues/notify", { company_id: companyId, ids: waiting.slice(0, 50) });
  } catch {
    // No connection, signed out, or refused: the next sync asks again (the server tells the
    // office once).
  } finally {
    running = false;
  }
}

/** Runs the notices after each finished sync (mounted once while signed in). */
export function watchIssueNotices(companyId: string, userId: string): () => void {
  const { sync } = getServices();
  let last = sync.status.lastSyncedAt;
  void flushIssueNotices(companyId, userId);
  return sync.subscribe(() => {
    const now = sync.status.lastSyncedAt;
    if (now === last) return;
    last = now;
    void flushIssueNotices(companyId, userId);
  });
}
