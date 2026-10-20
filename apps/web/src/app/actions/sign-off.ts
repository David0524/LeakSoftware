"use server";

import { adminClient } from "@/server/admin";
import { notifyReportSigned } from "@/server/notify-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UNSIGNED_CUSTOMER_AWAY } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";
import { createClient } from "@/lib/supabase/server";
import { finishReport, saveReportText } from "@/server/reports";
import { sectionsOf } from "./report-form";
import type { ReportFormState } from "./reports";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Finishes the report the customer just read: after they signed (the signature is already
 * saved), or with the reason nobody did. The version locks, so what they read is what they get.
 */
export async function finishSignOff(input: {
  reportId: string;
  jobId: string;
  customerAway: boolean;
}): Promise<Result> {
  const office = await getOffice();
  const db = await createClient();
  // The report's own job, read as the signed-in member in this shop: the team told below is
  // that job's, never one named by the caller (break testing, 2026-10-20).
  const { data: report } = isUuid(input.reportId)
    ? await db
        .from("report")
        .select("job_id")
        .eq("id", input.reportId)
        .eq("company_id", office.company.id)
        .maybeSingle()
    : { data: null };
  if (!report) return { ok: false, error: "This report is gone. Refresh the page." };
  const jobId = (report as { job_id: string }).job_id;
  try {
    await finishReport(db, input.reportId, input.customerAway ? UNSIGNED_CUSTOMER_AWAY : null);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  // Signed (not finished without the customer): the team hears about it.
  const admin = adminClient();
  if (admin && !input.customerAway) await notifyReportSigned(admin, jobId);
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true };
}

/** Review with Customer: saves the text on screen, then opens the report to sign. */
export async function reviewWithCustomer(
  _: ReportFormState,
  form: FormData,
): Promise<ReportFormState> {
  await getOffice();
  const reportId = String(form.get("report") ?? "");
  const final = sectionsOf(form);
  if (final.length && final.every((s) => !s.text)) return { error: "The report has no text." };
  try {
    if (final.length) await saveReportText(await createClient(), reportId, final);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(`/sign-off/${reportId}`);
}
