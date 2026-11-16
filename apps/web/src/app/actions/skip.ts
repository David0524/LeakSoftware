"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  SKIP_REASON_REQUIRED,
  canSkipVisit,
  pickableSkipReasons,
  skipValues,
  type SkipReason,
} from "@leakbook/core";
import { friendlyDbError } from "@/lib/limits";
import { getOffice, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import { notifySkips } from "@/server/skip-visits";
import type { FormState } from "./auth";

// Skip a Visit (owner, 2026-11-16; docs/design/2026-11-16-skip-visit.md): the same rows and
// rules as the phones, written as the signed-in member (row security and column grants apply).

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  revalidatePath("/today");
  revalidatePath("/schedule");
}

/**
 * Skip Visit: the visit becomes skipped with a reason from the shop's list and an optional
 * note. The owners and admins are pushed after the reply.
 */
export async function skipVisit(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const db = await createClient();
  const jobId = text(form, "job");
  const reason = text(form, "reason");
  if (!reason) return { error: SKIP_REASON_REQUIRED };
  const { data: job } = await db
    .from("job")
    .select("status, type")
    .eq("id", jobId)
    .eq("company_id", office.company.id)
    .maybeSingle();
  if (!job) return { error: "This visit is gone. Refresh the page." };
  if (!canSkipVisit(job)) return { error: "This visit can’t be skipped now." };
  const { data: rows } = await db
    .from("skip_reason")
    .select("id, label, sort_order, active, system, deleted_at")
    .eq("company_id", office.company.id)
    .is("deleted_at", null);
  if (!pickableSkipReasons((rows ?? []) as SkipReason[]).some((r) => r.label === reason))
    return { error: SKIP_REASON_REQUIRED };
  const { error } = await db
    .from("job")
    .update(skipValues({ reason, note: text(form, "note"), at: new Date().toISOString() }))
    .eq("id", jobId)
    .eq("company_id", office.company.id);
  if (error) return { error: friendlyDbError(error.message) };
  after(async () => {
    const admin = adminClient();
    if (admin) await notifySkips(admin, jobId);
  });
  refresh(jobId);
  return { message: "Visit skipped." };
}

/** Dismiss (owners and admins): the visit stays skipped and is marked handled. */
export async function dismissSkip(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  const db = await createClient();
  const jobId = text(form, "job");
  const { data, error } = await db
    .from("job")
    .update({ skip_handled_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("company_id", office.company.id)
    .eq("status", "skipped")
    .select("id");
  if (error) return { error: friendlyDbError(error.message) };
  if (!data?.length) return { error: "This visit is no longer skipped." };
  refresh(jobId);
  return { message: "Dismissed." };
}
