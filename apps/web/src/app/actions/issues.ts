"use server";

import { revalidatePath } from "next/cache";
import {
  canManageIssues,
  issueDescriptionError,
  issueNoteError,
  reopenIssueWrite,
  reportIssueRow,
  resolveIssueWrite,
  uuidv7,
  type IssueWork,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { friendlyDbError } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";
import { adminClient } from "@/server/admin";
import { notify } from "@/server/push";
import { IssueError, convertIssueWith, notifyIssuesWith } from "@/server/service-issues";
import type { FormState } from "./auth";

// Service issues from the website (docs/design/2026-11-16-service-issues.md): Report an Issue on
// a job, and the office's Make Quote, Make Leak Detection Job, Resolve and Reopen. Written as the
// signed-in member (row security applies; the database lets only owners and admins change an
// issue's status), the same rows the phones write offline.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Tells the owners and admins (best effort; never fails the report). */
async function announce(companyId: string, ids: string[]) {
  const admin = adminClient();
  if (!admin) return;
  try {
    await notifyIssuesWith(admin, (n) => notify(admin, { ...n, kind: "issue" }), {
      companyId,
      ids,
    });
  } catch {
    // The report is saved; a notification that doesn't go out never fails it.
  }
}

/**
 * Report an Issue on a job: what's wrong and the suggested work. Returns the issue's id in
 * `message`, so the sheet then uploads the photos and videos picked for it.
 */
export async function reportIssue(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const db = await createClient();
  const jobId = text(form, "job");
  const description = text(form, "description");
  const problem = issueDescriptionError(description);
  if (problem) return { fields: { description: problem } };
  const work = text(form, "suggested");
  const suggested: IssueWork | null = work === "repair" || work === "detection" ? work : null;
  if (!isUuid(jobId)) return { error: "Job not found." };
  const { data: job } = await db
    .from("job")
    .select(
      "id, property_id, bill_to_customer_id, property:property!job_property_id_company_id_fkey(customer_id)",
    )
    .eq("id", jobId)
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .maybeSingle();
  const j = job as unknown as {
    id: string;
    property_id: string;
    bill_to_customer_id: string | null;
    property: { customer_id: string } | null;
  } | null;
  const customerId = j?.bill_to_customer_id ?? j?.property?.customer_id;
  if (!j || !customerId) return { error: "Job not found." };
  const id = uuidv7();
  const { error } = await db.from("service_issue").insert({
    id,
    company_id: office.company.id,
    ...reportIssueRow({
      customerId,
      propertyId: j.property_id,
      jobId: j.id,
      description,
      suggested,
      now: new Date().toISOString(),
    }),
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs/issues");
  return { message: id };
}

/** After the sheet's photos are up: the owners and admins hear about it, with them in place. */
export async function announceIssue(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const id = text(form, "issue");
  if (isUuid(id)) await announce(office.company.id, [id]);
  return {};
}

async function manager() {
  const office = await getOffice();
  if (!canManageIssues(office.company.role))
    throw new IssueError("Only owners and admins can do this.");
  return office;
}

/** Make Quote (a repair job) or Make Leak Detection Job; opens the new job. */
export async function convertIssue(_: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "issue");
  const type = text(form, "type") === "detection" ? "detection" : "repair";
  try {
    const office = await manager();
    if (!isUuid(id)) return { error: "Issue not found." };
    const job = await convertIssueWith(await createClient(), {
      companyId: office.company.id,
      issueId: id,
      type,
      userId: office.user.id,
    });
    revalidatePath("/jobs");
    revalidatePath("/jobs/issues");
    revalidatePath(`/jobs/issues/${id}`);
    return { message: job };
  } catch (e) {
    return {
      error: e instanceof IssueError ? e.message : friendlyDbError((e as Error).message),
    };
  }
}

async function update(id: string, values: Record<string, unknown>): Promise<FormState> {
  try {
    const office = await manager();
    if (!isUuid(id)) return { error: "Issue not found." };
    const db = await createClient();
    const { error } = await db
      .from("service_issue")
      .update(values)
      .eq("id", id)
      .eq("company_id", office.company.id);
    if (error) return { error: friendlyDbError(error.message) };
    revalidatePath("/jobs/issues");
    revalidatePath(`/jobs/issues/${id}`);
    return {};
  } catch (e) {
    return { error: e instanceof IssueError ? e.message : friendlyDbError((e as Error).message) };
  }
}

/** Resolve, with an optional note. */
export async function resolveIssue(_: FormState, form: FormData): Promise<FormState> {
  const note = text(form, "note");
  const problem = issueNoteError(note);
  if (problem) return { fields: { note: problem } };
  const office = await getOffice();
  return update(
    text(form, "issue"),
    resolveIssueWrite(office.user.id, note, new Date().toISOString()),
  );
}

export async function reopenIssue(_: FormState, form: FormData): Promise<FormState> {
  return update(text(form, "issue"), reopenIssueWrite());
}
